import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Comment, CommentDocument } from '../schemas/comment.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { computeCommentContentFingerprint } from './comment-fingerprint.util';

export interface SpamDetectionResult {
  isSpam: boolean;
  score: number;
  reasons: string[];
  shouldWarnUser: boolean;
  shouldRestrictUser: boolean;
  restrictionHours?: number;
}

@Injectable()
export class SpamDetectionService {
  private logger: Logger;

  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationsService: NotificationsService,
  ) {
    this.logger = new Logger(SpamDetectionService.name);
  }

  private normalizeText(input: string): string {
    return (input ?? '')
      .replace(/\u00AD/g, '') // soft hyphen
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Публично для CommentsService при создании/редактировании */
  computeContentFingerprint(raw: string): string {
    return computeCommentContentFingerprint(raw);
  }

  /**
   * Совпадение по отпечатку и/или дословному тексту (старые документы без fingerprint).
   */
  private buildContentSimilarityQuery(
    comment: CommentDocument,
    fp: string,
  ): FilterQuery<CommentDocument> {
    const or: FilterQuery<CommentDocument>[] = [];
    if (fp.length >= 3) {
      or.push({ contentFingerprint: fp });
    }
    const exact = (comment.content ?? '').trim();
    if (exact.length > 0) {
      or.push({ content: comment.content });
    }

    // Важно: не считаем сам текущий comment в статистиках
    // (иначе все пороги/скоринг смещаются на +1).
    if (or.length === 0) {
      // Никаких сигналов для similarity — пусть подсчёты вернут 0.
      return { _id: { $in: [] } };
    }

    if (or.length === 1) {
      return { ...or[0], _id: { $ne: comment._id } };
    }

    return { $or: or, _id: { $ne: comment._id } };
  }

  private countRegexMatches(text: string, re: RegExp): number {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const r = new RegExp(re.source, flags);
    const m = text.match(r);
    return m ? m.length : 0;
  }

  private looksLikeUrl(text: string): boolean {
    return (
      /(https?:\/\/|www\.)/i.test(text) ||
      /\b[a-z0-9-]+\.(ru|com|net|org|site|xyz|top|shop|app|gg|me|io)\b/i.test(
        text,
      )
    );
  }

  /**
   * Detect spam in a comment
   */
  async detectSpam(
    comment: CommentDocument,
    user: UserDocument,
  ): Promise<SpamDetectionResult> {
    const reasons: string[] = [];
    let score = 0;

    const content = this.normalizeText(comment.content || '');
    const contentLower = content.toLowerCase();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fp =
      (comment as any).contentFingerprint?.trim() ||
      computeCommentContentFingerprint(comment.content || '');

    // 1. Check for duplicate comments from same user (по отпечатку и дословно)
    const similarityQuery = this.buildContentSimilarityQuery(comment, fp);
    const userDupCount = await this.commentModel.countDocuments({
      userId: user._id,
      createdAt: { $gte: since24h },
      ...similarityQuery,
    });

    if (userDupCount >= 4) {
      score += 30;
      reasons.push(
        `Пользователь отправил ${userDupCount} похожих комментариев за последние 24 часа`,
      );
    } else if (userDupCount >= 3) {
      score += 25;
      reasons.push(
        `Пользователь отправил ${userDupCount} похожих комментариев за последние 24 часа`,
      );
    } else if (userDupCount >= 2) {
      score += 15;
      reasons.push(
        `Пользователь отправил ${userDupCount} похожих комментария за последние 24 часа`,
      );
    }

    // 1.1 Global duplicates (много аккаунтов — один и тот же смысл/текст)
    if (fp.length >= 4) {
      const globalDuplicateCount = await this.commentModel.countDocuments({
        createdAt: { $gte: since24h },
        ...similarityQuery,
      });

      if (globalDuplicateCount >= 50) {
        score += 45;
        reasons.push(
          `Массовый повтор одного и того же комментария (за 24 часа: ${globalDuplicateCount})`,
        );
      } else if (globalDuplicateCount >= 25) {
        score += 40;
        reasons.push(
          `Очень частый повтор комментария (за 24 часа: ${globalDuplicateCount})`,
        );
      } else if (globalDuplicateCount >= 15) {
        score += 35;
        reasons.push(
          `Частый повтор одного и того же комментария (за 24 часа: ${globalDuplicateCount})`,
        );
      } else if (globalDuplicateCount >= 8) {
        score += 28;
        reasons.push(
          `Повторяющийся комментарий у многих пользователей (за 24 часа: ${globalDuplicateCount})`,
        );
      } else if (globalDuplicateCount >= 5) {
        score += 18;
        reasons.push(
          `Подозрительный повтор текста (за 24 часа: ${globalDuplicateCount})`,
        );
      }
    }

    // 2. Check comment length (too short or too long)
    if (content.length < 3) {
      score += 10;
      reasons.push('Комментарий слишком короткий (менее 3 символов)');
    }

    if (content.length > 1000) {
      score += 5;
      reasons.push('Комментарий слишком длинный (более 1000 символов)');
    }

    // 3. Links / contact / obvious spam patterns
    const urlCount = this.countRegexMatches(
      content,
      /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/i,
    );
    const domainLikeCount = this.countRegexMatches(
      contentLower,
      /\b[a-z0-9-]+\.(ru|com|net|org|site|xyz|top|shop|app|gg|me|io)\b/i,
    );
    const hasUrl = urlCount + domainLikeCount > 0 || this.looksLikeUrl(content);
    if (hasUrl) {
      const hits = urlCount + domainLikeCount;
      score += Math.min(35, 15 + hits * 10);
      reasons.push(
        hits > 0
          ? `Обнаружены ссылки/домены (${hits})`
          : 'Обнаружены ссылки/домены',
      );
    }

    const phoneLike = /(?:\+?\d[\d\s().-]{8,}\d)/.test(content);
    if (phoneLike) {
      score += 20;
      reasons.push('Похоже на номер телефона/контактные данные');
    }

    const contactPatterns = [
      /\b(в\s*лс|в\s*личк[уе]|в\s*директ|в\s*dm)\b/i,
      /\b(телеграм|tg|t\.me|telegram)\b/i,
      /\b(whatsapp|вайбер|viber)\b/i,
      /\b(инст(а|аграм)|instagram)\b/i,
      /\b(дискорд|discord)\b/i,
      /\b(vk\.com|вк\.ком|вконтакте)\b/i,
      /\b(подписывай(ся|тесь)|подпишись)\b/i,
      /\b(скидк|промокод|акция|розыгрыш)\b/i,
      /\b(куп(и|ить)|продам|заказ(ать|ывай)|дешев(о|ле)|заработ(ок|ай))\b/i,
      /\b(голосуй(те)?|проголосуй(те)?)\s+за\s+мои\b/i,
      /\bголосуйте\b.*\b(магазин|декор|топик)\b/i,
      /\b(магазин|декор).*\b(голосуй|проголосуй|поддержи)\b/i,
    ];
    let contactHits = 0;
    for (const p of contactPatterns) if (p.test(content)) contactHits++;
    if (contactHits > 0) {
      score += Math.min(40, contactHits * 12);
      reasons.push(`Маркетинг/контактные паттерны (${contactHits})`);
    }

    // 3.1 Реклама декоров / призывы голосовать (частый кейс)
    if (
      /\b(голосуй(те)?|проголосуй(те)?)\b/i.test(content) &&
      /\b(декор|магазин|топик|оформлени)\b/i.test(content)
    ) {
      score += 38;
      reasons.push('Призыв голосовать за декоры/магазин');
    }

    const handleCount = this.countRegexMatches(content, /@\w{3,}/i);
    if (handleCount > 0) {
      score += Math.min(15, 5 + handleCount * 5);
      reasons.push(`Упоминания @username (${handleCount})`);
    }

    // 4. Check user's recent comment frequency
    const recentCommentsCount = await this.commentModel.countDocuments({
      userId: user._id,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
      _id: { $ne: comment._id },
    });

    if (recentCommentsCount > 20) {
      score += 25;
      reasons.push(
        `Пользователь отправил ${recentCommentsCount} комментариев за последний час`,
      );
    } else if (recentCommentsCount > 10) {
      score += 15;
      reasons.push(
        `Пользователь отправил ${recentCommentsCount} комментариев за последний час`,
      );
    }

    // 4.1 Burst: very fast posting (last 2 minutes)
    const recent2m = await this.commentModel.countDocuments({
      userId: user._id,
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) },
      _id: { $ne: comment._id },
    });
    if (recent2m >= 4) {
      score += 25;
      reasons.push(
        `Подозрительно частые комментарии (за 2 минуты: ${recent2m})`,
      );
    } else if (recent2m >= 3) {
      score += 15;
      reasons.push(`Частые комментарии (за 2 минуты: ${recent2m})`);
    }

    // 4.2 Repeated chars / emoji flood / noise ratio
    if (/(.)\1{7,}/u.test(content)) {
      score += 15;
      reasons.push('Повторяющиеся символы (похоже на флуд)');
    }
    const emojiCount = this.countRegexMatches(
      content,
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u,
    );
    if (emojiCount >= 20) {
      score += 20;
      reasons.push(`Слишком много эмодзи (${emojiCount})`);
    } else if (emojiCount >= 12) {
      score += 10;
      reasons.push(`Много эмодзи (${emojiCount})`);
    }
    const letters = this.countRegexMatches(content, /[A-Za-zА-Яа-яЁё]/u);
    const digits = this.countRegexMatches(content, /\d/u);
    const nonSpace = content.replace(/\s+/g, '');
    const noise = nonSpace.length - letters - digits;
    if (nonSpace.length >= 20) {
      const noiseRatio = noise / nonSpace.length;
      if (noiseRatio > 0.55) {
        score += 15;
        reasons.push('Слишком много знаков/символов (шум)');
      }
    }

    const upper = this.countRegexMatches(content, /[A-ZА-ЯЁ]/u);
    if (letters >= 12 && upper / Math.max(1, letters) > 0.75) {
      score += 10;
      reasons.push('Много текста капсом');
    }

    // 4.3 Mixed alphabets in one word (рaзнobой латиницы/кириллицы)
    const mixedAlphabetWord =
      /\b(?=\w*[A-Za-z])(?=\w*[А-Яа-яЁё])[\wЁё]{4,}\b/u.test(content);
    if (mixedAlphabetWord) {
      score += 10;
      reasons.push('Смешение латиницы и кириллицы (маскировка)');
    }

    // 4.4 New account with marketing-like signals
    const userCreatedAt: Date | undefined = (user as any)?.createdAt
      ? new Date((user as any).createdAt)
      : undefined;
    if (
      userCreatedAt &&
      Date.now() - userCreatedAt.getTime() < 24 * 60 * 60 * 1000
    ) {
      if (hasUrl || contactHits > 0 || phoneLike) {
        score += 10;
        reasons.push('Новый аккаунт + подозрительный контент');
      }
    }

    // 5. Check if user is already restricted
    if (user.isCommentRestricted && user.commentRestrictedUntil > new Date()) {
      score += 50;
      reasons.push('Пользователь уже ограничен в комментировании');
    }

    // 6. Check user's spam warnings
    if (user.spamWarnings >= 3) {
      score += 40;
      reasons.push(
        `Пользователь имеет ${user.spamWarnings} предупреждений за спам`,
      );
    } else if (user.spamWarnings >= 1) {
      score += 20;
      reasons.push(
        `Пользователь имеет ${user.spamWarnings} предупреждений за спам`,
      );
    }

    // Determine actions based on score
    const isSpam = score >= 35;
    let shouldWarnUser = false;
    let shouldRestrictUser = false;
    let restrictionHours = 0;

    if (score >= 70) {
      shouldRestrictUser = true;
      restrictionHours = 24; // 24 hours restriction
      shouldWarnUser = true;
    } else if (score >= 50) {
      shouldRestrictUser = true;
      restrictionHours = 6; // 6 hours restriction
      shouldWarnUser = true;
    } else if (score >= 35) {
      shouldWarnUser = true;
    }

    return {
      isSpam,
      score,
      reasons,
      shouldWarnUser,
      shouldRestrictUser,
      restrictionHours,
    };
  }

  /**
   * Backfill spam checks for old comments (admin maintenance).
   * Scans comments and applies spam actions for those that match the heuristics.
   * Без `days` в выборку попадают комментарии за всё время; с `days` — не старше N дней.
   */
  async backfillSpamChecks(params?: {
    limit?: number;
    days?: number;
    onlyUnchecked?: boolean;
    dryRun?: boolean;
  }): Promise<{
    scanned: number;
    markedSpam: number;
    warned: number;
    restricted: number;
  }> {
    const limit = Math.min(Math.max(params?.limit ?? 500, 1), 5000);
    const onlyUnchecked = params?.onlyUnchecked ?? true;
    const dryRun = params?.dryRun ?? false;

    const filter: Record<string, any> = {};
    if (params?.days != null) {
      const days = Math.min(Math.max(params.days, 1), 3650);
      filter.createdAt = {
        $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      };
    }
    if (onlyUnchecked) {
      filter.isSpamChecked = { $ne: true };
    }

    const cursor = this.commentModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .cursor();

    let scanned = 0;
    let markedSpam = 0;
    let warned = 0;
    let restricted = 0;

    for await (const comment of cursor) {
      scanned++;
      try {
        const user = await this.userModel.findById((comment as any).userId);
        if (!user) continue;

        const fp = computeCommentContentFingerprint(
          String((comment as any).content ?? ''),
        );
        if (!dryRun && !(comment as any).contentFingerprint && fp) {
          await this.commentModel.updateOne(
            { _id: (comment as any)._id },
            { $set: { contentFingerprint: fp } },
          );
          (comment as any).contentFingerprint = fp;
        }

        const spamResult = await this.detectSpam(comment as any, user as any);
        const hasAction =
          spamResult.isSpam ||
          spamResult.shouldWarnUser ||
          spamResult.shouldRestrictUser;

        if (hasAction) {
          if (!dryRun) {
            await this.applySpamActions(
              comment as any,
              user as any,
              spamResult,
            );
          }
          if (spamResult.isSpam) markedSpam++;
          if (spamResult.shouldWarnUser) warned++;
          if (spamResult.shouldRestrictUser) restricted++;
        } else if (!dryRun && onlyUnchecked) {
          // mark as checked so we don't rescan forever
          await this.commentModel.updateOne(
            { _id: (comment as any)._id },
            {
              $set: {
                isSpamChecked: true,
                spamDetectedAt: new Date(),
                spamScore: spamResult.score,
                spamReasons: spamResult.reasons,
              },
            },
          );
        }
      } catch (e) {
        this.logger.warn(
          `Backfill spam check failed for comment ${String((comment as any)?._id)}: ${
            (e as Error).message
          }`,
        );
      }
    }

    return { scanned, markedSpam, warned, restricted };
  }

  /**
   * Apply spam actions to user and comment
   */
  async applySpamActions(
    comment: CommentDocument,
    user: UserDocument,
    detectionResult: SpamDetectionResult,
  ): Promise<void> {
    // Mark comment as spam
    comment.isSpam = detectionResult.isSpam;
    comment.isSpamChecked = true;
    comment.spamDetectedAt = new Date();
    comment.spamScore = detectionResult.score;
    comment.spamReasons = detectionResult.reasons;
    if (!(comment as any).contentFingerprint?.trim()) {
      (comment as any).contentFingerprint = computeCommentContentFingerprint(
        comment.content || '',
      );
    }

    // Скрываем от публики при уверенном авто-спаме (ниже порога — только метка для админки)
    if (detectionResult.isSpam && detectionResult.score >= 45) {
      comment.isVisible = false;
    }
    await comment.save();

    // Update user's spam activity log
    const spamLogEntry = {
      commentId: comment._id,
      detectedAt: new Date(),
      reason: detectionResult.reasons.join('; '),
      action: detectionResult.shouldRestrictUser
        ? 'restriction'
        : detectionResult.shouldWarnUser
          ? 'warning'
          : 'deletion',
    };

    await this.userModel.updateOne(
      { _id: user._id },
      {
        $push: { spamActivityLog: spamLogEntry },
        $inc: { spamWarnings: detectionResult.shouldWarnUser ? 1 : 0 },
        $set: {
          lastSpamWarningAt: detectionResult.shouldWarnUser
            ? new Date()
            : user.lastSpamWarningAt,
        },
      },
    );

    // Apply restriction if needed
    if (
      detectionResult.shouldRestrictUser &&
      detectionResult.restrictionHours
    ) {
      const restrictionUntil = new Date();
      restrictionUntil.setHours(
        restrictionUntil.getHours() + detectionResult.restrictionHours,
      );

      await this.userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            isCommentRestricted: true,
            commentRestrictedUntil: restrictionUntil,
          },
        },
      );
    }

    // Send notification/warning to user
    if (detectionResult.shouldWarnUser) {
      this.logger.warn(
        `User ${user._id} received spam warning for comment ${comment._id}`,
      );
      try {
        await this.notificationsService.create({
          userId: user._id.toString(),
          type: 'SYSTEM' as any,
          title: '⚠️ Предупреждение за спам',
          message: `Ваш комментарий был помечен как возможный спам (score: ${detectionResult.score}/100).\n\nПричины:\n${detectionResult.reasons.map((r) => `• ${r}`).join('\\n')}\n\nДальнейшие нарушения могут привести к ограничению комментирования.`,
          metadata: {
            spamScore: detectionResult.score,
            reasons: detectionResult.reasons,
            commentId: comment._id.toString(),
          },
        });
      } catch (error) {
        this.logger.error(`Failed to send spam warning notification: ${error}`);
      }
    }
  }

  /**
   * Check if user is allowed to comment
   */
  async canUserComment(userId: Types.ObjectId): Promise<{
    allowed: boolean;
    reason?: string;
    restrictedUntil?: Date;
  }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      return { allowed: false, reason: 'Пользователь не найден' };
    }

    if (user.isCommentRestricted && user.commentRestrictedUntil) {
      if (user.commentRestrictedUntil > new Date()) {
        return {
          allowed: false,
          reason: 'Вы ограничены в комментировании',
          restrictedUntil: user.commentRestrictedUntil,
        };
      } else {
        // Restriction expired, clear it
        await this.userModel.updateOne(
          { _id: user._id },
          {
            $set: {
              isCommentRestricted: false,
              commentRestrictedUntil: null,
            },
          },
        );
      }
    }

    return { allowed: true };
  }

  /**
   * Manually mark comment as spam (for admin)
   */
  async markAsSpam(
    commentId: Types.ObjectId,
    adminId: Types.ObjectId,
    reason: string,
  ): Promise<void> {
    await this.commentModel.updateOne(
      { _id: commentId },
      {
        $set: {
          isSpam: true,
          isSpamChecked: true,
          spamDetectedAt: new Date(),
          spamCheckedBy: adminId,
          spamReasons: [reason],
        },
      },
    );

    // Find comment to get user
    const comment = await this.commentModel.findById(commentId);
    if (comment) {
      // Add warning to user
      await this.userModel.updateOne(
        { _id: comment.userId },
        {
          $inc: { spamWarnings: 1 },
          $set: { lastSpamWarningAt: new Date() },
          $push: {
            spamActivityLog: {
              commentId,
              detectedAt: new Date(),
              reason: `Администратор: ${reason}`,
              action: 'warning',
            },
          },
        },
      );
    }
  }

  /**
   * Manually mark comment as not spam (for admin)
   */
  async markAsNotSpam(
    commentId: Types.ObjectId,
    adminId: Types.ObjectId,
    reason: string,
  ): Promise<void> {
    await this.commentModel.updateOne(
      { _id: commentId },
      {
        $set: {
          isSpam: false,
          isSpamChecked: true,
          spamDetectedAt: new Date(),
          spamCheckedBy: adminId,
          spamReasons: [reason],
        },
      },
    );
  }

  /**
   * Get spam statistics
   */
  async getSpamStats(): Promise<{
    totalSpamComments: number;
    totalRestrictedUsers: number;
    recentSpamComments: number;
  }> {
    const totalSpamComments = await this.commentModel.countDocuments({
      isSpam: true,
    });

    const totalRestrictedUsers = await this.userModel.countDocuments({
      isCommentRestricted: true,
      commentRestrictedUntil: { $gt: new Date() },
    });

    const recentSpamComments = await this.commentModel.countDocuments({
      isSpam: true,
      spamDetectedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    return {
      totalSpamComments,
      totalRestrictedUsers,
      recentSpamComments,
    };
  }
}

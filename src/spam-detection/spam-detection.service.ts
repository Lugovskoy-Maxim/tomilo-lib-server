import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from '../schemas/comment.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';

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

  private countRegexMatches(text: string, re: RegExp): number {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const r = new RegExp(re.source, flags);
    const m = text.match(r);
    return m ? m.length : 0;
  }

  private looksLikeUrl(text: string): boolean {
    return /(https?:\/\/|www\.)/i.test(text) || /\b[a-z0-9-]+\.(ru|com|net|org|site|xyz|top|shop|app|gg|me|io)\b/i.test(text);
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

    // 1. Check for duplicate comments from same user
    const duplicateComments = await this.commentModel
      .find({
        userId: user._id,
        content: comment.content,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      })
      .limit(5);

    if (duplicateComments.length >= 3) {
      score += 30;
      reasons.push(
        `Пользователь отправил ${duplicateComments.length} одинаковых комментария за последние 24 часа`,
      );
    } else if (duplicateComments.length >= 2) {
      score += 15;
      reasons.push(
        `Пользователь отправил ${duplicateComments.length} одинаковых комментария за последние 24 часа`,
      );
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
    ];
    let contactHits = 0;
    for (const p of contactPatterns) if (p.test(content)) contactHits++;
    if (contactHits > 0) {
      score += Math.min(30, contactHits * 10);
      reasons.push(`Маркетинг/контактные паттерны (${contactHits})`);
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
    });
    if (recent2m >= 4) {
      score += 25;
      reasons.push(`Подозрительно частые комментарии (за 2 минуты: ${recent2m})`);
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
    const mixedAlphabetWord = /\b(?=\w*[A-Za-z])(?=\w*[А-Яа-яЁё])[\wЁё]{4,}\b/u.test(
      content,
    );
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

    // Auto-hide high-confidence spam so it doesn't appear in feeds/leaderboards
    if (detectionResult.isSpam && detectionResult.score >= 50) {
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
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    return {
      totalSpamComments,
      totalRestrictedUsers,
      recentSpamComments,
    };
  }
}

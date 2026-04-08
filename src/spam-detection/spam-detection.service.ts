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

  /**
   * Detect spam in a comment
   */
  async detectSpam(
    comment: CommentDocument,
    user: UserDocument,
  ): Promise<SpamDetectionResult> {
    const reasons: string[] = [];
    let score = 0;

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
    if (comment.content.length < 3) {
      score += 10;
      reasons.push('Комментарий слишком короткий (менее 3 символов)');
    }

    if (comment.content.length > 1000) {
      score += 5;
      reasons.push('Комментарий слишком длинный (более 1000 символов)');
    }

    // 3. Check for spam patterns (common spam words)
    const spamPatterns = [
      /купить/i,
      /продам/i,
      /заказать/i,
      /голосуйте за/i,
      /дешево/i,
      /скидка/i,
      /http:\/\//i,
      /https:\/\//i,
      /www\./i,
      /\.(ru|com|net|org)/i,
      /[0-9]{10,}/, // phone numbers
    ];

    let patternMatches = 0;
    for (const pattern of spamPatterns) {
      if (pattern.test(comment.content)) {
        patternMatches++;
      }
    }

    if (patternMatches > 0) {
      score += patternMatches * 10;
      reasons.push(`Обнаружены спам-паттерны (${patternMatches} совпадений)`);
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
    const isSpam = score >= 30;
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
    } else if (score >= 30) {
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

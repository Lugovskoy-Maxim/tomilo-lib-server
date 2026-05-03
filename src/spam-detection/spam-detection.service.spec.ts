import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { SpamDetectionService } from './spam-detection.service';

describe('SpamDetectionService.detectSpam', () => {
  const logger = new Logger('test');

  const makeService = (commentModelCountDocumentsMock: jest.Mock) => {
    // В текущем проекте SpamDetectionService использует @InjectModel(Comment.name),
    // но в unit-тесте удобнее напрямую создать инстанс с моками.
    const service = new SpamDetectionService(
      {
        countDocuments: commentModelCountDocumentsMock,
      } as any,
      {} as any,
      {} as NotificationsService,
    );

    // Принудительно подставим logger, чтобы не было побочных эффектов
    (service as any).logger = logger;

    return service;
  };

  it('excludes current comment _id from similarity/deduplication counts', async () => {
    const commentId = new Types.ObjectId();
    const userId = new Types.ObjectId();

    const comment = {
      _id: commentId,
      userId,
      content: 'Hello world',
      contentFingerprint: 'abcd', // fp.length >= 4 => включит globalDuplicateCount
    } as any;

    const user = {
      _id: userId,
      spamWarnings: 0,
      isCommentRestricted: false,
      commentRestrictedUntil: new Date(0),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    } as any;

    const countDocuments = jest.fn();
    // 1) userDupCount
    countDocuments.mockResolvedValueOnce(0);
    // 2) globalDuplicateCount
    countDocuments.mockResolvedValueOnce(0);
    // 3) recentCommentsCount (last hour)
    countDocuments.mockResolvedValueOnce(0);
    // 4) recent2m (last 2 minutes)
    countDocuments.mockResolvedValueOnce(0);

    const service = makeService(countDocuments);

    await service.detectSpam(comment, user);

    // call #1: userDupCount
    const filter1 = countDocuments.mock.calls[0][0];
    expect(filter1).toHaveProperty('_id');
    expect(filter1._id).toEqual({ $ne: commentId });

    // call #2: globalDuplicateCount
    const filter2 = countDocuments.mock.calls[1][0];
    expect(filter2).toHaveProperty('_id');
    expect(filter2._id).toEqual({ $ne: commentId });
  });

  it('excludes current comment _id from user frequency counts', async () => {
    const commentId = new Types.ObjectId();
    const userId = new Types.ObjectId();

    const comment = {
      _id: commentId,
      userId,
      content: 'Hello world',
      contentFingerprint: 'abcd',
    } as any;

    const user = {
      _id: userId,
      spamWarnings: 0,
      isCommentRestricted: false,
      commentRestrictedUntil: new Date(0),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    } as any;

    const countDocuments = jest.fn();
    countDocuments
      .mockResolvedValueOnce(0) // userDupCount
      .mockResolvedValueOnce(0) // globalDuplicateCount
      .mockResolvedValueOnce(0) // recentCommentsCount
      .mockResolvedValueOnce(0); // recent2m

    const service = makeService(countDocuments);

    await service.detectSpam(comment, user);

    // call #3: recentCommentsCount
    const filter3 = countDocuments.mock.calls[2][0];
    expect(filter3).toHaveProperty('_id');
    expect(filter3._id).toEqual({ $ne: commentId });

    // call #4: recent2m
    const filter4 = countDocuments.mock.calls[3][0];
    expect(filter4).toHaveProperty('_id');
    expect(filter4._id).toEqual({ $ne: commentId });
  });
});

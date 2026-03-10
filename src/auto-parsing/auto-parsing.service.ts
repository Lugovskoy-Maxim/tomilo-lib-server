import {
  Injectable,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AutoParsingJob,
  AutoParsingJobDocument,
  ParsingFrequency,
} from '../schemas/auto-parsing-job.schema';
import { CreateAutoParsingJobDto } from './dto/create-auto-parsing-job.dto';
import { UpdateAutoParsingJobDto } from './dto/update-auto-parsing-job.dto';
import { MangaParserService } from '../manga-parser/manga-parser.service';
import { TitlesService } from '../titles/titles.service';
import { ChaptersService } from '../chapters/chapters.service';

@Injectable()
export class AutoParsingService implements OnModuleInit {
  private readonly logger = new Logger(AutoParsingService.name);

  constructor(
    @InjectModel(AutoParsingJob.name)
    private autoParsingJobModel: Model<AutoParsingJobDocument>,
    private mangaParserService: MangaParserService,
    private titlesService: TitlesService,
    private chaptersService: ChaptersService,
  ) {}

  async onModuleInit() {
    await this.backfillMissingScheduleHours();
  }

  private getDeterministicScheduleHour(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash % 24;
  }

  private async backfillMissingScheduleHours() {
    const legacyJobs = await this.autoParsingJobModel
      .find({
        $or: [{ scheduleHour: { $exists: false } }, { scheduleHour: null }],
      })
      .select('_id titleId')
      .lean();

    if (legacyJobs.length === 0) {
      return;
    }

    const bulkOperations = legacyJobs.map((job) => {
      const seed = `${job.titleId?.toString?.() ?? ''}-${job._id.toString()}`;
      return {
        updateOne: {
          filter: { _id: job._id },
          update: { $set: { scheduleHour: this.getDeterministicScheduleHour(seed) } },
        },
      };
    });

    await this.autoParsingJobModel.bulkWrite(bulkOperations);
    this.logger.log(
      `Backfilled scheduleHour for ${legacyJobs.length} auto-parsing job(s)`,
    );
  }

  /**
   * Get sources array from job, handling backward compatibility with single URL
   */
  private getSourcesFromJob(job: AutoParsingJob): string[] {
    // If sources array is defined and not empty, use it
    if (job.sources && job.sources.length > 0) {
      return job.sources;
    }
    // Fall back to deprecated url field for backward compatibility
    if (job.url) {
      return [job.url];
    }
    return [];
  }

  /**
   * Determine the order of sources to try based on last used source
   */
  private getSourceOrder(
    sources: string[],
    lastUsedSourceIndex: number,
  ): number[] {
    // If we have a last used source, try it first
    if (lastUsedSourceIndex >= 0 && lastUsedSourceIndex < sources.length) {
      const order = [lastUsedSourceIndex];
      // Add remaining sources in order
      for (let i = 0; i < sources.length; i++) {
        if (i !== lastUsedSourceIndex) {
          order.push(i);
        }
      }
      return order;
    }
    // Default: try sources in order
    return sources.map((_, i) => i);
  }

  private chapterExistsInList(
    chapterNumber: number,
    existingChapterNumbers: (number | string)[],
  ): boolean {
    return existingChapterNumbers.some((existing) => {
      const existingNum =
        typeof existing === 'string' ? parseFloat(existing) : existing;
      const chapterNum = Number(chapterNumber);
      if (isNaN(existingNum) || isNaN(chapterNum)) {
        return String(existing) === String(chapterNumber);
      }
      if (Number.isInteger(existingNum) && Number.isInteger(chapterNum)) {
        return existingNum === chapterNum;
      }
      return Math.abs(existingNum - chapterNum) < 0.001;
    });
  }

  async create(
    createAutoParsingJobDto: CreateAutoParsingJobDto,
  ): Promise<AutoParsingJob> {
    // Verify title exists
    await this.titlesService.findById(createAutoParsingJobDto.titleId);

    // Check if job already exists for this title
    const existingJob = await this.autoParsingJobModel.findOne({
      titleId: createAutoParsingJobDto.titleId,
    });
    if (existingJob) {
      throw new BadRequestException(
        'Auto-parsing job already exists for this title',
      );
    }

    // Handle both single url (deprecated) and sources array
    const { sources, url } = createAutoParsingJobDto;

    // Validate that we have at least one source
    const sourceArray =
      sources && sources.length > 0 ? sources : url ? [url] : null;

    if (!sourceArray) {
      throw new BadRequestException('At least one source URL is required');
    }

    const createdJob = new this.autoParsingJobModel({
      ...createAutoParsingJobDto,
      sources: sourceArray,
      scheduleHour:
        createAutoParsingJobDto.scheduleHour ??
        this.getDeterministicScheduleHour(createAutoParsingJobDto.titleId),
      // Clear the deprecated url field when using sources
      url: sources && sources.length > 0 ? undefined : url,
    });

    return createdJob.save();
  }

  async findAll(): Promise<AutoParsingJob[]> {
    return this.autoParsingJobModel.find().populate('titleId').exec();
  }

  async findOne(id: string): Promise<AutoParsingJob> {
    const job = await this.autoParsingJobModel
      .findById(id)
      .populate('titleId')
      .exec();
    if (!job) {
      throw new BadRequestException('Auto-parsing job not found');
    }
    return job;
  }

  async update(
    id: string,
    updateAutoParsingJobDto: UpdateAutoParsingJobDto,
  ): Promise<AutoParsingJob> {
    // Handle sources update - if sources is explicitly provided, use it
    // Otherwise preserve existing sources
    const updateData = { ...updateAutoParsingJobDto };

    if (updateData.sources === null || updateData.sources === undefined) {
      // If sources not being updated, get existing value
      const existingJob = await this.autoParsingJobModel.findById(id);
      if (existingJob) {
        updateData.sources = existingJob.sources;
        if (
          updateData.scheduleHour === undefined &&
          (existingJob.scheduleHour === undefined ||
            existingJob.scheduleHour === null)
        ) {
          updateData.scheduleHour = this.getDeterministicScheduleHour(
            `${existingJob.titleId?.toString?.() ?? ''}-${existingJob._id.toString()}`,
          );
        }
      }
    }

    // Handle backward compatibility
    if (
      updateData.sources &&
      Array.isArray(updateData.sources) &&
      updateData.sources.length > 0
    ) {
      updateData.url = undefined;
    }

    const updatedJob = await this.autoParsingJobModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('titleId')
      .exec();
    if (!updatedJob) {
      throw new BadRequestException('Auto-parsing job not found');
    }
    return updatedJob;
  }

  async remove(id: string): Promise<void> {
    const result = await this.autoParsingJobModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new BadRequestException('Auto-parsing job not found');
    }
  }

  async checkForNewChapters(jobId: string): Promise<any[]> {
    const job = await this.findOne(jobId);
    if (!job.enabled) {
      this.logger.log(`Job ${jobId} is disabled, skipping`);
      return [];
    }

    if (!job.titleId) {
      throw new BadRequestException('Title not found for this job');
    }

    const titleId = job.titleId._id.toString();
    const sources = this.getSourcesFromJob(job);

    if (sources.length === 0) {
      throw new BadRequestException('No sources configured for this job');
    }

    this.logger.log(
      `Checking for new chapters for title ${job.titleId._id.toString()} with ${sources.length} source(s)`,
    );

    try {
      // Get existing chapters for the title
      const title = await this.titlesService.findById(
        job.titleId._id.toString(),
      );
      const existingChapters = await this.chaptersService.getChaptersByTitle(
        job.titleId._id.toString(),
      );
      const existingChapterNumbers = existingChapters.map((ch) => {
        if (typeof ch.chapterNumber === 'string') {
          const num = parseFloat(ch.chapterNumber);
          return isNaN(num) ? ch.chapterNumber : num;
        }
        return ch.chapterNumber;
      });

      // Determine source order - try last used source first
      const sourceOrder = this.getSourceOrder(
        sources,
        job.lastUsedSourceIndex ?? 0,
      );

      // Проверяем ВСЕ источники и собираем главы с каждого
      type SourceResult = {
        sourceIndex: number;
        url: string;
        chapters: Array<{
          number?: number;
          name: string;
          url?: string;
          slug?: string;
        }>;
      };
      const successfulSources: SourceResult[] = [];
      const errors: string[] = [];

      for (const sourceIndex of sourceOrder) {
        const url = sources[sourceIndex];
        this.logger.log(
          `Trying source ${sourceIndex + 1}/${sources.length}: ${url}`,
        );

        try {
          const result =
            await this.mangaParserService.parseChaptersInfoDetailed(url);

          if (result.success && result.chapters.length > 0) {
            this.logger.log(
              `Found ${result.chapters.length} chapters from source: ${url}`,
            );
            successfulSources.push({
              sourceIndex,
              url,
              chapters: result.chapters,
            });
          } else if (!result.success) {
            errors.push(`${url}: ${result.error || 'Unknown error'}`);
          } else {
            errors.push(`${url}: No chapters found`);
          }
        } catch (error) {
          const errorMessage = `Failed to parse ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          this.logger.warn(errorMessage);
          errors.push(errorMessage);
        }
      }

      if (successfulSources.length === 0) {
        this.logger.error(
          `All ${sources.length} sources failed for title ${title.name}. Errors: ${errors.join('; ')}`,
        );
        throw new BadRequestException(
          'No sources were able to provide chapter information',
        );
      }

      // Множество номеров глав, которых ещё нет в БД (объединение по всем источникам)
      const newChapterNumbersSet = new Set<number>();
      for (const { chapters } of successfulSources) {
        for (const ch of chapters) {
          if (
            ch.number === undefined ||
            ch.number === null ||
            isNaN(Number(ch.number))
          ) {
            continue;
          }
          const num = Number(ch.number);
          if (!this.chapterExistsInList(num, existingChapterNumbers)) {
            newChapterNumbersSet.add(num);
          }
        }
      }

      const newChapterNumbersList = Array.from(newChapterNumbersSet).sort(
        (a, b) => a - b,
      );
      this.logger.log(
        `New chapters to import (from all sources): ${newChapterNumbersList.length}`,
      );

      if (newChapterNumbersList.length === 0) {
        this.logger.log(
          `No new chapters found for title ${title.name} (all chapters may already exist)`,
        );
        const firstUsed = successfulSources[0];
        await this.autoParsingJobModel.findByIdAndUpdate(jobId, {
          lastChecked: new Date(),
          lastUsedSourceIndex: firstUsed.sourceIndex,
          lastUsedSourceUrl: firstUsed.url,
        });
        return [];
      }

      // Импортируем новые главы: для каждого источника — те новые номера, которые есть на нём и ещё не импортированы
      const remainingToImport = new Set(newChapterNumbersList);
      const allImported: any[] = [];
      let lastUsedSourceIndex = successfulSources[0].sourceIndex;
      let lastUsedSourceUrl = successfulSources[0].url;

      for (const { sourceIndex, url, chapters } of successfulSources) {
        const numbersFromThisSource = chapters
          .filter((ch) => {
            const n = ch.number != null ? Number(ch.number) : NaN;
            return !isNaN(n) && remainingToImport.has(n);
          })
          .map((ch) => Number(ch.number!));

        if (numbersFromThisSource.length === 0) continue;

        this.logger.log(
          `Importing ${numbersFromThisSource.length} chapter(s) from source: ${url}`,
        );

        const imported =
          await this.mangaParserService.parseAndImportChapters({
            url,
            titleId,
            chapterNumbers: numbersFromThisSource.map(String),
          });

        for (const c of imported) {
          const num =
            typeof (c as any).chapterNumber === 'number'
              ? (c as any).chapterNumber
              : parseFloat((c as any).chapterNumber);
          if (!isNaN(num)) remainingToImport.delete(num);
          allImported.push(c);
        }
        lastUsedSourceIndex = sourceIndex;
        lastUsedSourceUrl = url;
      }

      await this.autoParsingJobModel.findByIdAndUpdate(jobId, {
        lastChecked: new Date(),
        lastUsedSourceIndex: lastUsedSourceIndex,
        lastUsedSourceUrl: lastUsedSourceUrl,
      });

      this.logger.log(
        `Imported ${allImported.length} new chapters for title ${title.name} from ${successfulSources.length} source(s)`,
      );
      return allImported;
    } catch (error) {
      this.logger.error(
        `Failed to check for new chapters: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Синхронизирует страницы одной главы из источников автопарсинга (по жалобе «отсутствуют страницы»).
   * Ищет job по titleId, берёт источники, вызывает syncChaptersFromSource для данной главы.
   */
  async syncChapterPages(
    titleId: string,
    chapterId: string,
  ): Promise<{ synced: boolean; error?: string }> {
    try {
      const job = await this.autoParsingJobModel
        .findOne({ titleId, enabled: true })
        .lean()
        .exec();
      if (!job) {
        return { synced: false, error: 'no_auto_parsing_job' };
      }
      const sources = this.getSourcesFromJob(job as AutoParsingJob);
      if (sources.length === 0) {
        return { synced: false, error: 'no_sources' };
      }
      const chapter = await this.chaptersService.findById(chapterId);
      const chapterNumber = Number(chapter.chapterNumber);
      if (Number.isNaN(chapterNumber)) {
        return { synced: false, error: 'invalid_chapter_number' };
      }
      const sourceOrder = this.getSourceOrder(
        sources,
        job.lastUsedSourceIndex ?? 0,
      );
      const sourceUrl = sources[sourceOrder[0]];
      const result = await this.mangaParserService.syncChaptersFromSource(
        titleId,
        sourceUrl,
        [chapterNumber],
      );
      if (result.errors.length > 0) {
        this.logger.warn(
          `syncChapterPages chapter ${chapterNumber} errors: ${result.errors.map((e) => e.error).join('; ')}`,
        );
        return {
          synced: result.synced.length > 0,
          error: result.errors[0]?.error,
        };
      }
      if (result.synced.length > 0) {
        this.logger.log(
          `syncChapterPages: synced chapter ${chapterNumber} for title ${titleId}`,
        );
        return { synced: true };
      }
      return {
        synced: false,
        error: result.skipped[0]?.reason ?? 'not_synced',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`syncChapterPages failed: ${message}`);
      return { synced: false, error: message };
    }
  }

  /** Jobs without scheduleHour: run at 0, 6, 12, 18 (unchanged for existing jobs). */
  @Cron(CronExpression.EVERY_6_HOURS)
  async handleDailyJobs() {
    this.logger.log('Starting daily auto-parsing jobs (legacy schedule)');
    await this.processJobsByFrequency(ParsingFrequency.DAILY, {
      onlyWithoutScheduleHour: true,
    });
    this.logger.log('Completed daily auto-parsing jobs (legacy schedule)');
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyJobs() {
    await this.processJobsByFrequency(ParsingFrequency.WEEKLY, {
      onlyWithoutScheduleHour: true,
    });
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async handleMonthlyJobs() {
    await this.processJobsByFrequency(ParsingFrequency.MONTHLY, {
      onlyWithoutScheduleHour: true,
    });
  }

  /** Every hour: run jobs that have scheduleHour set to current hour (spreads load). */
  @Cron(CronExpression.EVERY_HOUR)
  async handleScheduledByHourJobs() {
    const now = new Date();
    const hour = now.getUTCHours();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday
    const dayOfMonth = now.getUTCDate();

    // Daily: run at scheduleHour every day
    await this.processJobsByFrequency(ParsingFrequency.DAILY, {
      scheduleHour: hour,
    });

    // Weekly: run at scheduleHour on Sunday (same day as EVERY_WEEK)
    if (dayOfWeek === 0) {
      await this.processJobsByFrequency(ParsingFrequency.WEEKLY, {
        scheduleHour: hour,
      });
    }

    // Monthly: run at scheduleHour on 1st
    if (dayOfMonth === 1) {
      await this.processJobsByFrequency(ParsingFrequency.MONTHLY, {
        scheduleHour: hour,
      });
    }
  }

  private async processJobsByFrequency(
    frequency: ParsingFrequency,
    options?: {
      onlyWithoutScheduleHour?: boolean;
      scheduleHour?: number;
    },
  ) {
    const query: Record<string, unknown> = { frequency, enabled: true };

    if (options?.onlyWithoutScheduleHour) {
      query.$or = [
        { scheduleHour: { $exists: false } },
        { scheduleHour: null },
      ];
    } else if (options?.scheduleHour !== undefined) {
      query.scheduleHour = options.scheduleHour;
    }

    const jobs = await this.autoParsingJobModel.find(query).exec();

    for (const job of jobs) {
      try {
        await this.checkForNewChapters(job._id.toString());
      } catch (error) {
        this.logger.error(
          `Failed to process job ${job._id.toString()}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }
}

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
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
export class AutoParsingService {
  private readonly logger = new Logger(AutoParsingService.name);

  constructor(
    @InjectModel(AutoParsingJob.name)
    private autoParsingJobModel: Model<AutoParsingJobDocument>,
    private mangaParserService: MangaParserService,
    private titlesService: TitlesService,
    private chaptersService: ChaptersService,
  ) {}

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

    const createdJob = new this.autoParsingJobModel(createAutoParsingJobDto);
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
    const updatedJob = await this.autoParsingJobModel
      .findByIdAndUpdate(id, updateAutoParsingJobDto, { new: true })
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

    try {
      // Parse chapters info from the URL
      const parsedData = await this.mangaParserService.parseChaptersInfo({
        url: job.url,
      });

      // Get existing chapters for the title
      const title = await this.titlesService.findById(job.titleId.toString());
      const existingChapters = await this.chaptersService.getChaptersByTitle(
        job.titleId.toString(),
      );
      const existingChapterNumbers = existingChapters.map(
        (ch) => ch.chapterNumber,
      );

      // Find new chapters
      const newChapters = parsedData.chapters.filter(
        (ch) =>
          ch.number !== undefined &&
          !existingChapterNumbers.includes(ch.number),
      );

      if (newChapters.length === 0) {
        this.logger.log(`No new chapters found for title ${title.name}`);
        return [];
      }

      // Import new chapters
      const importedChapters =
        await this.mangaParserService.parseAndImportChapters({
          url: job.url,
          titleId: job.titleId.toString(),
          chapterNumbers: newChapters.map((ch) => ch.number!.toString()),
        });

      // Update last checked
      await this.autoParsingJobModel.findByIdAndUpdate(jobId, {
        lastChecked: new Date(),
      });

      this.logger.log(
        `Imported ${importedChapters.length} new chapters for title ${title.name}`,
      );
      return importedChapters;
    } catch (error) {
      this.logger.error(`Failed to check for new chapters: ${error.message}`);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyJobs() {
    await this.processJobsByFrequency(ParsingFrequency.DAILY);
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyJobs() {
    await this.processJobsByFrequency(ParsingFrequency.WEEKLY);
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async handleMonthlyJobs() {
    await this.processJobsByFrequency(ParsingFrequency.MONTHLY);
  }

  private async processJobsByFrequency(frequency: ParsingFrequency) {
    const jobs = await this.autoParsingJobModel
      .find({ frequency, enabled: true })
      .exec();

    for (const job of jobs) {
      try {
        await this.checkForNewChapters(job._id.toString());
      } catch (error) {
        this.logger.error(`Failed to process job ${error.message}`);
      }
    }
  }
}

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

    if (!job.titleId) {
      throw new BadRequestException('Title not found for this job');
    }

    const titleId = job.titleId._id.toString();

    try {
      // Parse chapters info from the URL
      const parsedData = await this.mangaParserService.parseChaptersInfo({
        url: job.url,
      });

      // Get existing chapters for the title
      const title = await this.titlesService.findById(
        job.titleId._id.toString(),
      );
      const existingChapters = await this.chaptersService.getChaptersByTitle(
        job.titleId._id.toString(),
      );
      const existingChapterNumbers = existingChapters.map((ch) => {
        // Убедимся, что номер главы является числом
        if (typeof ch.chapterNumber === 'string') {
          const num = parseFloat(ch.chapterNumber);
          return isNaN(num) ? ch.chapterNumber : num;
        }
        return ch.chapterNumber;
      });

      // Find new chapters
      this.logger.log(
        `Existing chapter numbers: ${JSON.stringify(existingChapterNumbers)} (types: ${existingChapterNumbers.map((n) => typeof n).join(', ')})`,
      );
      this.logger.log(
        `Parsed chapter numbers: ${JSON.stringify(parsedData.chapters.map((ch) => ch.number))} (types: ${parsedData.chapters.map((ch) => typeof ch.number).join(', ')})`,
      );

      const newChapters = parsedData.chapters.filter((ch) => {
        // Проверяем, что номер главы существует и является числом
        if (ch.number === undefined || ch.number === null || isNaN(ch.number)) {
          this.logger.log(
            `Skipping chapter with invalid number: ${JSON.stringify(ch)}`,
          );
          return false;
        }

        // Преобразуем номер главы к числу для сравнения
        const chapterNumber = Number(ch.number);

        // Проверяем, что глава еще не существует
        const exists = existingChapterNumbers.some((existing) => {
          // Преобразуем оба значения к числам для сравнения
          const existingNum =
            typeof existing === 'string' ? parseFloat(existing) : existing;
          const chapterNum =
            typeof chapterNumber === 'string'
              ? parseFloat(chapterNumber)
              : chapterNumber;

          // Проверяем, являются ли оба значения корректными числами
          if (isNaN(existingNum) || isNaN(chapterNum)) {
            // Если одно из значений не является числом, сравниваем как строки
            const result = String(existing) === String(chapterNumber);
            this.logger.log(
              `Comparing as strings: ${existing} with ${chapterNumber}: ${result}`,
            );
            return result;
          }

          // Для целых чисел используем строгое сравнение
          if (Number.isInteger(existingNum) && Number.isInteger(chapterNum)) {
            const result = existingNum === chapterNum;
            this.logger.log(
              `Comparing integers ${existingNum} with ${chapterNum}: ${result}`,
            );
            return result;
          }

          // Для чисел с плавающей точкой используем сравнение с допустимой погрешностью
          const result = Math.abs(existingNum - chapterNum) < 0.001;
          this.logger.log(
            `Comparing floats ${existingNum} with ${chapterNum}: ${result}`,
          );
          return result;
        });

        this.logger.log(`Chapter ${chapterNumber} exists: ${exists}`);
        return !exists;
      });

      this.logger.log(`New chapters to import: ${newChapters.length}`);

      if (newChapters.length === 0) {
        // Проверим, есть ли вообще главы для импорта
        if (parsedData.chapters.length === 0) {
          this.logger.log(
            `No chapters found on source website for title ${title.name}`,
          );
          throw new BadRequestException(
            'No chapters found on the source website',
          );
        } else {
          this.logger.log(
            `No new chapters found for title ${title.name} (all chapters may already exist)`,
          );
          // Не выбрасываем исключение, просто возвращаем пустой массив
          return [];
        }
      }

      // Import new chapters
      const importedChapters =
        await this.mangaParserService.parseAndImportChapters({
          url: job.url,
          titleId: titleId,
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

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleDailyJobs() {
    this.logger.log('Starting daily auto-parsing jobs');
    await this.processJobsByFrequency(ParsingFrequency.DAILY);
    this.logger.log('Completed daily auto-parsing jobs');
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

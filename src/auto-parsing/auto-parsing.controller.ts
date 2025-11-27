import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AutoParsingService } from './auto-parsing.service';
import { CreateAutoParsingJobDto } from './dto/create-auto-parsing-job.dto';
import { UpdateAutoParsingJobDto } from './dto/update-auto-parsing-job.dto';

@Controller('auto-parsing')
export class AutoParsingController {
  private readonly logger = new Logger(AutoParsingController.name);

  constructor(private readonly autoParsingService: AutoParsingService) {}

  @Post()
  async create(@Body() createAutoParsingJobDto: CreateAutoParsingJobDto) {
    try {
      this.logger.log(
        `Creating auto-parsing job for title: ${createAutoParsingJobDto.titleId}`,
      );
      const result = await this.autoParsingService.create(
        createAutoParsingJobDto,
      );
      this.logger.log(`Successfully created auto-parsing job: ${result._id}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to create auto-parsing job: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new HttpException(
        `Failed to create auto-parsing job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async findAll() {
    try {
      this.logger.log('Fetching all auto-parsing jobs');
      const result = await this.autoParsingService.findAll();
      this.logger.log(`Found ${result.length} auto-parsing jobs`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch auto-parsing jobs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new HttpException(
        `Failed to fetch auto-parsing jobs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      this.logger.log(`Fetching auto-parsing job: ${id}`);
      const result = await this.autoParsingService.findOne(id);
      this.logger.log(`Successfully fetched auto-parsing job: ${id}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch auto-parsing job: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new HttpException(
        `Failed to fetch auto-parsing job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAutoParsingJobDto: UpdateAutoParsingJobDto,
  ) {
    try {
      this.logger.log(`Updating auto-parsing job: ${id}`);
      const result = await this.autoParsingService.update(
        id,
        updateAutoParsingJobDto,
      );
      this.logger.log(`Successfully updated auto-parsing job: ${id}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to update auto-parsing job: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new HttpException(
        `Failed to update auto-parsing job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      this.logger.log(`Deleting auto-parsing job: ${id}`);
      await this.autoParsingService.remove(id);
      this.logger.log(`Successfully deleted auto-parsing job: ${id}`);
      return { message: 'Auto-parsing job deleted successfully' };
    } catch (error) {
      this.logger.error(
        `Failed to delete auto-parsing job: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new HttpException(
        `Failed to delete auto-parsing job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/check')
  async checkForNewChapters(@Param('id') id: string) {
    try {
      this.logger.log(`Checking for new chapters for job: ${id}`);
      const result = await this.autoParsingService.checkForNewChapters(id);
      this.logger.log(
        `Checked for new chapters for job: ${id}, found ${result.length} new chapters`,
      );
      return { newChapters: result };
    } catch (error) {
      this.logger.error(
        `Failed to check for new chapters: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new HttpException(
        `Failed to check for new chapters: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

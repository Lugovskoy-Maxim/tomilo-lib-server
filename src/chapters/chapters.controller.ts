import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';

@Controller('chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Post()
  async create(@Body() createChapterDto: CreateChapterDto) {
    return this.chaptersService.create(createChapterDto);
  }

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('titleId') titleId: string,
    @Query('sortBy') sortBy: string = 'chapterNumber',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.chaptersService.findAll({
      page: Number(page),
      limit: Number(limit),
      titleId,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.chaptersService.findById(id);
  }

  @Get(':id/next')
  async getNextChapter(
    @Param('id') id: string,
    @Query('currentChapter') currentChapter: number,
  ) {
    const chapter = await this.chaptersService.findById(id);
    return this.chaptersService.getNextChapter(
      chapter.titleId._id.toString(),
      currentChapter,
    );
  }

  @Get(':id/prev')
  async getPrevChapter(
    @Param('id') id: string,
    @Query('currentChapter') currentChapter: number,
  ) {
    const chapter = await this.chaptersService.findById(id);
    return this.chaptersService.getPrevChapter(
      chapter.titleId._id.toString(),
      currentChapter,
    );
  }

  @Get('title/:titleId')
  async getChaptersByTitle(
    @Param('titleId') titleId: string,
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc',
  ) {
    return this.chaptersService.getChaptersByTitle(titleId, sortOrder);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateChapterDto: UpdateChapterDto,
  ) {
    return this.chaptersService.update(id, updateChapterDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.chaptersService.delete(id);
  }

  @Post(':id/view')
  async incrementViews(@Param('id') id: string) {
    return this.chaptersService.incrementViews(id);
  }
}

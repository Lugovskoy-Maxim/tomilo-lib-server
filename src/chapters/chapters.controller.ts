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
  Header,
  UploadedFiles,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { multerConfig } from '../config/multer.config';

@Controller('chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Post()
  async create(@Body() createChapterDto: CreateChapterDto) {
    return this.chaptersService.create(createChapterDto);
  }

  @Post('upload')
  @UseInterceptors(FilesInterceptor('pages', 50, multerConfig))
  @UsePipes(new ValidationPipe({ transform: true }))
  async createWithPages(
    @Body() createChapterDto: CreateChapterDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.chaptersService.createWithPages(createChapterDto, files);
  }

  @Get()
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
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

  @Get('count')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async count(@Query('titleId') titleId?: string) {
    const total = await this.chaptersService.count({ titleId });
    return { total };
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
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getChaptersByTitle(
    @Param('titleId') titleId: string,
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc',
  ) {
    return this.chaptersService.getChaptersByTitle(titleId, sortOrder);
  }

  @Get('by-number/:titleId')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getByNumber(
    @Param('titleId') titleId: string,
    @Query('chapterNumber') chapterNumber: number,
  ) {
    return this.chaptersService.findByTitleAndNumber(
      titleId,
      Number(chapterNumber),
    );
  }

  @Get('latest/:titleId')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getLatest(@Param('titleId') titleId: string) {
    return this.chaptersService.getLatestChapter(titleId);
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

  @Post(':id/pages')
  @UseInterceptors(FilesInterceptor('pages', 100, multerConfig))
  @UsePipes(new ValidationPipe({ transform: true }))
  async addPages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.chaptersService.addPagesToChapter(id, files);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  async bulkDelete(@Body('ids') ids: string[]) {
    const result = await this.chaptersService.bulkDelete(ids || []);
    return { deleted: result.deletedCount };
  }
}

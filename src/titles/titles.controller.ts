import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { TitlesService } from './titles.service';
import { CreateTitleDto } from './dto/create-title.dto';
import { UpdateTitleDto } from './dto/update-title.dto';
import { extname } from 'path';

@Controller('titles')
export class TitlesController {
  constructor(private readonly titlesService: TitlesService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('coverImage', {
      storage: diskStorage({
        destination: './uploads/covers',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async create(
    @Body() createTitleDto: CreateTitleDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      createTitleDto.coverImage = `/uploads/covers/${file.filename}`;
    }
    return this.titlesService.create(createTitleDto);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('coverImage', {
      storage: diskStorage({
        destination: './uploads/covers',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() updateTitleDto: UpdateTitleDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      updateTitleDto.coverImage = `/uploads/covers/${file.filename}`;
    }
    return this.titlesService.update(id, updateTitleDto);
  }

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('genre') genre?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.titlesService.findAll({
      page: Number(page),
      limit: Number(limit),
      search,
      genre,
      status: status as any,
      sortBy,
      sortOrder,
    });
  }

  @Get('popular')
  async getPopular(@Query('limit') limit = 10) {
    return this.titlesService.getPopularTitles(Number(limit));
  }

  @Get('recent')
  async getRecent(@Query('limit') limit = 10) {
    return this.titlesService.getRecentTitles(Number(limit));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.titlesService.findById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.titlesService.delete(id);
  }

  @Post(':id/view')
  async incrementViews(@Param('id') id: string) {
    return this.titlesService.incrementViews(id);
  }
}

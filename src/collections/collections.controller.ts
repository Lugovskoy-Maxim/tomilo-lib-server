import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpStatus,
  HttpCode,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { Types } from 'mongoose';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.collectionsService.findAll({
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get('top')
  @HttpCode(HttpStatus.OK)
  async getTopCollections() {
    return this.collectionsService.getTopCollections(10);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string) {
    return this.collectionsService.findById(id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('cover', {
      storage: diskStorage({
        destination: './uploads/collections',
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
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createCollectionDto: CreateCollectionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      createCollectionDto.cover = `/uploads/collections/${file.filename}`;
    }
    return this.collectionsService.create(createCollectionDto);
  }

  @Put(':id')
  @UseInterceptors(
    FileInterceptor('cover', {
      storage: diskStorage({
        destination: './uploads/collections',
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
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() updateCollectionDto: UpdateCollectionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      updateCollectionDto.cover = `/uploads/collections/${file.filename}`;
    }
    return this.collectionsService.update(id, updateCollectionDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.collectionsService.delete(id);
  }

  @Post(':id/views')
  @HttpCode(HttpStatus.OK)
  async incrementViews(@Param('id') id: string) {
    return this.collectionsService.incrementViews(id);
  }

  @Post(':id/titles/:titleId')
  @HttpCode(HttpStatus.OK)
  async addTitle(
    @Param('id') collectionId: string,
    @Param('titleId') titleId: string,
  ) {
    return this.collectionsService.addTitle(
      collectionId,
      new Types.ObjectId(titleId),
    );
  }

  @Delete(':id/titles/:titleId')
  @HttpCode(HttpStatus.OK)
  async removeTitle(
    @Param('id') collectionId: string,
    @Param('titleId') titleId: string,
  ) {
    return this.collectionsService.removeTitle(
      collectionId,
      new Types.ObjectId(titleId),
    );
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.OK)
  async addComment(
    @Param('id') collectionId: string,
    @Body('comment') comment: string,
  ) {
    return this.collectionsService.addComment(collectionId, comment);
  }

  @Delete(':id/comments/:index')
  @HttpCode(HttpStatus.OK)
  async removeComment(
    @Param('id') collectionId: string,
    @Param('index') commentIndex: number,
  ) {
    return this.collectionsService.removeComment(collectionId, commentIndex);
  }
}

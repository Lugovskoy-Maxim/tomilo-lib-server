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
  UseGuards,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { Types } from 'mongoose';
import { LoggerService } from '../common/logger/logger.service';

@Controller('collections')
export class CollectionsController {
  private readonly logger = new LoggerService();

  constructor(private readonly collectionsService: CollectionsService) {
    this.logger.setContext(CollectionsController.name);
  }

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
  getTopCollections() {
    return {
      success: true,
      data: this.collectionsService.getTopCollections(10),
      message: ' Top collections found successfully',
      timestamp: new Date().toISOString(),
      path: 'top',
      method: 'GET',
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string) {
    return {
      success: true,
      data: await this.collectionsService.findById(id),
      message: 'Collection found successfully',
      timestamp: new Date().toISOString(),
      path: 'id',
      method: 'GET',
    };
  }

  @Post()
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileInterceptor('cover', {
      storage: memoryStorage(),
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
    @Request() req,
    @Body() createCollectionDto: CreateCollectionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.logger.log(
      `Creating collection with data: ${JSON.stringify(createCollectionDto)}`,
    );
    this.logger.log(
      `User making request: ${req.user?.email} (${req.user?.userId}) with roles: ${req.user?.roles?.join(', ')}`,
    );

    return {
      success: true,
      data: await this.collectionsService.create(createCollectionDto, file),
      message: ' Collection created successfully',
      timestamp: new Date().toISOString(),
      path: 'uploads/collections',
      method: 'POST',
    };
  }

  @Put(':id')
  @UseInterceptors(
    FileInterceptor('cover', {
      storage: memoryStorage(),
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
    return {
      success: true,
      data: await this.collectionsService.update(id, updateCollectionDto, file),
      message: ' Collection updated successfully',
      timestamp: new Date().toISOString(),
      path: 'uploads/collections',
      method: 'POST',
    };
  }

  @Delete(':id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return {
      success: true,
      data: await this.collectionsService.delete(id),
      message: ' Collection deleted successfully',
      timestamp: new Date().toISOString(),
      path: 'id',
      method: 'DELETE',
    };
  }

  @Post(':id/views')
  @HttpCode(HttpStatus.OK)
  async incrementViews(@Param('id') id: string) {
    return {
      success: true,
      data: await this.collectionsService.incrementViews(id),
      message: ' Collection views incremented successfully',
      timestamp: new Date().toISOString(),
      path: 'id/views',
      method: 'POST',
    };
  }

  @Post(':id/titles/:titleId')
  @HttpCode(HttpStatus.OK)
  async addTitle(
    @Param('id') collectionId: string,
    @Param('titleId') titleId: string,
  ) {
    return {
      success: true,
      data: await this.collectionsService.addTitle(
        collectionId,
        new Types.ObjectId(titleId),
      ),
      message: ' Collection title added successfully',
      timestamp: new Date().toISOString(),
      path: 'id/titles/:titleId',
      method: 'POST',
    };
  }

  @Delete(':id/titles/:titleId')
  @HttpCode(HttpStatus.OK)
  async removeTitle(
    @Param('id') collectionId: string,
    @Param('titleId') titleId: string,
  ) {
    return {
      success: true,
      data: await this.collectionsService.removeTitle(
        collectionId,
        new Types.ObjectId(titleId),
      ),
      message: ' Collection title removed successfully',
      timestamp: new Date().toISOString(),
      path: 'id/titles/:titleId',
      method: 'DELETE',
    };
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.OK)
  async addComment(
    @Param('id') collectionId: string,
    @Body('comment') comment: string,
  ) {
    return {
      success: true,
      data: await this.collectionsService.addComment(collectionId, comment),
      message: ' Collection comment added successfully',
      timestamp: new Date().toISOString(),
      path: 'id/comments',
      method: 'POST',
    };
  }

  @Delete(':id/comments/:index')
  @HttpCode(HttpStatus.OK)
  async removeComment(
    @Param('id') collectionId: string,
    @Param('index') commentIndex: number,
  ) {
    return {
      success: true,
      data: await this.collectionsService.removeComment(
        collectionId,
        commentIndex,
      ),
      message: ' Collection comment removed successfully',
      timestamp: new Date().toISOString(),
      path: 'id/comments/:index',
      method: 'DELETE',
    };
  }
}

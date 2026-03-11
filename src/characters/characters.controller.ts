import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';

interface RequestWithUser extends Request {
  user?: { userId: string; email: string; username?: string; roles?: string[] };
}

@Controller('characters')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get('moderation/pending')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getPendingForModeration(): Promise<
    ApiResponseDto<{ characters: any[]; total: number }>
  > {
    try {
      const characters =
        await this.charactersService.findPendingForModeration();
      return {
        success: true,
        data: { characters, total: characters.length },
        timestamp: new Date().toISOString(),
        path: 'characters/moderation/pending',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch pending characters',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'characters/moderation/pending',
      };
    }
  }

  @Get('list')
  async getList(
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ): Promise<ApiResponseDto<{ characters: any[]; total: number }>> {
    try {
      const page = Math.max(1, parseInt(String(pageStr || '1'), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(limitStr || '24'), 10) || 24),
      );
      const { characters, total } = await this.charactersService.findPaginated(
        page,
        limit,
      );
      return {
        success: true,
        data: { characters, total },
        timestamp: new Date().toISOString(),
        path: 'characters/list',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch characters',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'characters/list',
      };
    }
  }

  @Get('title/:titleId')
  async getByTitleId(
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<{ characters: any[]; total: number }>> {
    try {
      const characters = await this.charactersService.findByTitleId(titleId);
      return {
        success: true,
        data: { characters, total: characters.length },
        timestamp: new Date().toISOString(),
        path: `characters/title/${titleId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch characters',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `characters/title/${titleId}`,
      };
    }
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.charactersService.findById(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `characters/${id}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch character',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `characters/${id}`,
      };
    }
  }

  @Post('propose')
  @UseGuards(JwtAuthGuard)
  async proposeCreate(
    @Body() dto: CreateCharacterDto,
    @Req() req: RequestWithUser,
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('Unauthorized');
      }
      const data = await this.charactersService.proposeCreate(dto, userId);
      return {
        success: true,
        data,
        message: 'Character submitted for moderation',
        timestamp: new Date().toISOString(),
        path: 'characters/propose',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to submit character for moderation',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'characters/propose',
        method: 'POST',
      };
    }
  }

  @Post('propose/with-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async proposeCreateWithImage(
    @Body('data') dataStr: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: RequestWithUser,
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('Unauthorized');
      }
      if (!dataStr) {
        throw new BadRequestException('Field "data" (JSON) is required');
      }
      let dto: CreateCharacterDto;
      try {
        dto = JSON.parse(dataStr) as CreateCharacterDto;
      } catch {
        throw new BadRequestException('Invalid JSON in field "data"');
      }
      if (!dto.titleId || !dto.name?.trim()) {
        throw new BadRequestException('titleId and name are required');
      }
      const data = file
        ? await this.charactersService.proposeCreateWithImage(dto, file, userId)
        : await this.charactersService.proposeCreate(dto, userId);
      return {
        success: true,
        data,
        message: 'Character submitted for moderation',
        timestamp: new Date().toISOString(),
        path: 'characters/propose/with-image',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to submit character for moderation',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'characters/propose/with-image',
        method: 'POST',
      };
    }
  }

  @Put(':id/propose')
  @UseGuards(JwtAuthGuard)
  async proposeUpdate(
    @Param('id') id: string,
    @Body() dto: UpdateCharacterDto,
    @Req() req: RequestWithUser,
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('Unauthorized');
      }
      const data = await this.charactersService.proposeUpdate(id, dto, userId);
      return {
        success: true,
        data,
        message: 'Update submitted for moderation',
        timestamp: new Date().toISOString(),
        path: `characters/${id}/propose`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to submit update for moderation',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `characters/${id}/propose`,
        method: 'PUT',
      };
    }
  }

  @Put(':id/propose/image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async proposeImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('Unauthorized');
      }
      if (!file) {
        throw new BadRequestException('Image file is required');
      }
      const data = await this.charactersService.proposeImage(id, file, userId);
      return {
        success: true,
        data,
        message: 'Image submitted for moderation',
        timestamp: new Date().toISOString(),
        path: `characters/${id}/propose/image`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to submit image for moderation',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `characters/${id}/propose/image`,
        method: 'PUT',
      };
    }
  }

  @Patch(':id/approve')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async approve(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.charactersService.approve(id);
      return {
        success: true,
        data,
        message: 'Character approved',
        timestamp: new Date().toISOString(),
        path: `characters/${id}/approve`,
        method: 'PATCH',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to approve character',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `characters/${id}/approve`,
        method: 'PATCH',
      };
    }
  }

  @Patch(':id/reject')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async reject(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.charactersService.reject(id);
      return {
        success: true,
        data,
        message: 'Character/revision rejected',
        timestamp: new Date().toISOString(),
        path: `characters/${id}/reject`,
        method: 'PATCH',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to reject',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `characters/${id}/reject`,
        method: 'PATCH',
      };
    }
  }

  @Post()
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async create(@Body() dto: CreateCharacterDto): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.charactersService.create(dto);
      return {
        success: true,
        data,
        message: 'Character created successfully',
        timestamp: new Date().toISOString(),
        path: 'characters',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create character',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'characters',
        method: 'POST',
      };
    }
  }

  @Post('with-image')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async createWithImage(
    @Body('data') dataStr: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!dataStr) {
        throw new BadRequestException('Field "data" (JSON) is required');
      }
      let dto: CreateCharacterDto;
      try {
        dto = JSON.parse(dataStr) as CreateCharacterDto;
      } catch {
        throw new BadRequestException('Invalid JSON in field "data"');
      }
      if (!dto.titleId || !dto.name?.trim()) {
        throw new BadRequestException('titleId and name are required');
      }
      const data = file
        ? await this.charactersService.createWithImage(dto, file)
        : await this.charactersService.create(dto);
      return {
        success: true,
        data,
        message: 'Character created successfully',
        timestamp: new Date().toISOString(),
        path: 'characters/with-image',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create character',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'characters/with-image',
        method: 'POST',
      };
    }
  }

  @Put(':id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCharacterDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.charactersService.update(id, dto);
      return {
        success: true,
        data,
        message: 'Character updated successfully',
        timestamp: new Date().toISOString(),
        path: `characters/${id}`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update character',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `characters/${id}`,
        method: 'PUT',
      };
    }
  }

  @Put(':id/image')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async updateImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!file) {
        throw new BadRequestException('Image file is required');
      }
      const data = await this.charactersService.updateImage(id, file);
      return {
        success: true,
        data,
        message: 'Character image updated successfully',
        timestamp: new Date().toISOString(),
        path: `characters/${id}/image`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update character image',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `characters/${id}/image`,
        method: 'PUT',
      };
    }
  }

  @Delete(':id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async delete(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    try {
      await this.charactersService.delete(id);
      return {
        success: true,
        message: 'Character deleted successfully',
        timestamp: new Date().toISOString(),
        path: `characters/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete character',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `characters/${id}`,
        method: 'DELETE',
      };
    }
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('characters')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

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
          return cb(new BadRequestException('Only image files are allowed'), false);
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
          return cb(new BadRequestException('Only image files are allowed'), false);
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

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { TranslatorTeamsService } from './translator-teams.service';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTranslatorTeamDto } from './dto/create-translator-team.dto';
import { UpdateTranslatorTeamDto } from './dto/update-translator-team.dto';
import { AddMemberDto } from './dto/add-member.dto';

function toResponse(doc: any) {
  const obj = doc?.toObject ? doc.toObject() : doc;
  if (!obj) return obj;
  const id = obj._id?.toString?.();
  return {
    ...obj,
    _id: id ?? obj._id,
    chaptersCount: 0,
    subscribersCount: 0,
    totalViews: 0,
    members: (obj.members || []).map((m: any) => ({
      ...m,
      _id: m._id?.toString?.() ?? m._id,
      userId: m.userId?.toString?.(),
    })),
    titleIds: (obj.titleIds || []).map((id: any) =>
      typeof id === 'string' ? id : id?.toString?.() ?? id,
    ),
  };
}

@Controller('translator-teams')
@UsePipes(new ValidationPipe({ whitelist: true }))
export class TranslatorTeamsController {
  constructor(private readonly translatorTeamsService: TranslatorTeamsService) {}

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
  ): Promise<ApiResponseDto<any>> {
    const data = await this.translatorTeamsService.findAll({
      page: Number(page),
      limit: Number(limit),
      search,
    });
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: 'translator-teams',
    };
  }

  @Get('title/:titleId')
  async findByTitle(
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<any[]>> {
    const data = await this.translatorTeamsService.findByTitleId(titleId);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: `translator-teams/title/${titleId}`,
    };
  }

  @Get('slug/:slug')
  async findBySlug(
    @Param('slug') slug: string,
  ): Promise<ApiResponseDto<any>> {
    const team = await this.translatorTeamsService.findBySlug(
      decodeURIComponent(slug),
    );
    const titles = await this.translatorTeamsService.getTitlesForTeam(
      team.titleIds || [],
    );
    return {
      success: true,
      data: { ...toResponse(team), titles },
      timestamp: new Date().toISOString(),
      path: `translator-teams/slug/${slug}`,
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    const team = await this.translatorTeamsService.findById(id);
    const titles = await this.translatorTeamsService.getTitlesForTeam(
      team.titleIds || [],
    );
    return {
      success: true,
      data: { ...toResponse(team), titles },
      timestamp: new Date().toISOString(),
      path: `translator-teams/${id}`,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async create(
    @Body() dto: CreateTranslatorTeamDto,
  ): Promise<ApiResponseDto<any>> {
    const team = await this.translatorTeamsService.create(dto);
    return {
      success: true,
      data: toResponse(team),
      message: 'Team created',
      timestamp: new Date().toISOString(),
      path: 'translator-teams',
      method: 'POST',
    };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTranslatorTeamDto,
  ): Promise<ApiResponseDto<any>> {
    const team = await this.translatorTeamsService.update(id, dto);
    return {
      success: true,
      data: toResponse(team),
      message: 'Team updated',
      timestamp: new Date().toISOString(),
      path: `translator-teams/${id}`,
      method: 'PUT',
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async delete(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    await this.translatorTeamsService.delete(id);
    return {
      success: true,
      message: 'Team deleted',
      timestamp: new Date().toISOString(),
      path: `translator-teams/${id}`,
      method: 'DELETE',
    };
  }

  @Post(':id/members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ): Promise<ApiResponseDto<any>> {
    const team = await this.translatorTeamsService.addMember(id, dto);
    return {
      success: true,
      data: toResponse(team),
      message: 'Member added',
      timestamp: new Date().toISOString(),
      path: `translator-teams/${id}/members`,
      method: 'POST',
    };
  }

  @Delete(':id/members/:memberId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ): Promise<ApiResponseDto<any>> {
    const team = await this.translatorTeamsService.removeMember(id, memberId);
    return {
      success: true,
      data: toResponse(team),
      message: 'Member removed',
      timestamp: new Date().toISOString(),
      path: `translator-teams/${id}/members/${memberId}`,
      method: 'DELETE',
    };
  }

  @Post(':id/titles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async addTitle(
    @Param('id') id: string,
    @Body() body: { titleId: string },
  ): Promise<ApiResponseDto<any>> {
    const team = await this.translatorTeamsService.addTitle(id, body.titleId);
    return {
      success: true,
      data: toResponse(team),
      message: 'Title added to team',
      timestamp: new Date().toISOString(),
      path: `translator-teams/${id}/titles`,
      method: 'POST',
    };
  }

  @Delete(':id/titles/:titleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async removeTitle(
    @Param('id') id: string,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<any>> {
    const team = await this.translatorTeamsService.removeTitle(id, titleId);
    return {
      success: true,
      data: toResponse(team),
      message: 'Title removed from team',
      timestamp: new Date().toISOString(),
      path: `translator-teams/${id}/titles/${titleId}`,
      method: 'DELETE',
    };
  }
}

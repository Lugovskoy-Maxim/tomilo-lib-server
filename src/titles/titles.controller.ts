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
import { TitlesService } from './titles.service';
import { CreateTitleDto } from './dto/create-title.dto';
import { UpdateTitleDto } from './dto/update-title.dto';

@Controller('titles')
export class TitlesController {
  constructor(private readonly titlesService: TitlesService) {}

  @Post()
  async create(@Body() createTitleDto: CreateTitleDto) {
    return this.titlesService.create(createTitleDto);
  }

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string,
    @Query('genre') genre: string,
    @Query('status') status: string,
    @Query('sortBy') sortBy: string = 'createdAt',
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
  async getPopular(@Query('limit') limit: number = 10) {
    return this.titlesService.getPopularTitles(Number(limit));
  }

  @Get('recent')
  async getRecent(@Query('limit') limit: number = 10) {
    return this.titlesService.getRecentTitles(Number(limit));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.titlesService.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateTitleDto: UpdateTitleDto,
  ) {
    return this.titlesService.update(id, updateTitleDto);
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

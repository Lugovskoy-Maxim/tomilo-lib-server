import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Title, TitleDocument } from '../schemas/title.schema';
import { TitlesService } from '../titles/titles.service';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    private readonly titlesService: TitlesService,
  ) {}

  async searchTitles({
    search,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    canViewAdult = true,
  }: {
    search: string;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    canViewAdult?: boolean;
  }) {
    const result = await this.titlesService.findAll({
      search,
      page: 1,
      limit,
      sortBy,
      sortOrder,
      canViewAdult,
    });

    return result.titles;
  }

  /**
   * Быстрый поиск для автодополнения (минимальные данные, без пагинации)
   */
  async autocomplete({
    search,
    limit = 5,
    canViewAdult = true,
  }: {
    search: string;
    limit?: number;
    canViewAdult?: boolean;
  }): Promise<TitleDocument[]> {
    if (!search || search.length < 2) {
      return [];
    }

    const query: any = {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { altNames: { $regex: search, $options: 'i' } },
      ],
    };

    if (!canViewAdult) {
      const adultFilter = {
        $or: [
          { ageLimit: { $lt: 18 } },
          { ageLimit: { $exists: false } },
          { ageLimit: null },
        ],
      };
      query.$and = [{ $or: query.$or }, adultFilter];
      delete query.$or;
    }

    const titles = await this.titleModel
      .find(query)
      .select('name slug coverImage type')
      .sort({ weekViews: -1 })
      .limit(Math.min(limit, 10))
      .lean()
      .exec();

    return titles as TitleDocument[];
  }
}

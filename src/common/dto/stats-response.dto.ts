// Base statistics
export class StatsResponseDto {
  // General counts
  totalTitles!: number;
  totalChapters!: number;
  totalUsers!: number;
  totalCollections!: number;
  totalViews!: number;
  totalBookmarks!: number;

  // Daily statistics
  daily!: {
    views: number;
    newUsers: number;
    newTitles: number;
    newChapters: number;
    chaptersRead: number;
  };

  // Weekly statistics
  weekly!: {
    views: number;
    newUsers: number;
    newTitles: number;
    newChapters: number;
    chaptersRead: number;
  };

  // Monthly statistics
  monthly!: {
    views: number;
    newUsers: number;
    newTitles: number;
    newChapters: number;
    chaptersRead: number;
  };

  // Popular content (top 10)
  popularTitles!: {
    id: string;
    name: string;
    slug: string;
    views: number;
    dayViews: number;
    weekViews: number;
    monthViews: number;
  }[];

  popularChapters!: {
    id: string;
    titleId: string;
    titleName: string;
    chapterNumber: number;
    name: string;
    views: number;
  }[];

  // Additional metrics
  activeUsersToday!: number;
  newUsersThisMonth!: number;
  totalRatings!: number;
  averageRating!: number;
  ongoingTitles!: number;
  completedTitles!: number;

  // Stale ongoing titles (no updates for over a month)
  staleOngoingTitles!: number;

  // Historical data
  dailyHistory?: {
    date: string;
    newUsers: number;
    activeUsers: number;
    newTitles: number;
    newChapters: number;
    chaptersRead: number;
    titleViews: number;
    chapterViews: number;
    comments: number;
    ratings: number;
    bookmarks: number;
  }[];

  monthlyHistory?: {
    year: number;
    month: number;
    totalNewUsers: number;
    totalActiveUsers: number;
    totalNewTitles: number;
    totalNewChapters: number;
    totalChaptersRead: number;
    totalTitleViews: number;
    totalChapterViews: number;
    totalComments: number;
    totalRatings: number;
    totalBookmarks: number;
  }[];

  yearlyHistory?: {
    year: number;
    totalNewUsers: number;
    totalActiveUsers: number;
    totalNewTitles: number;
    totalNewChapters: number;
    totalChaptersRead: number;
    totalTitleViews: number;
    totalChapterViews: number;
    totalComments: number;
    totalRatings: number;
    totalBookmarks: number;
  }[];
}

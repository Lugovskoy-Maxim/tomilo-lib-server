// Base statistics
export class StatsResponseDto {
  // General counts
  totalTitles: number;
  totalChapters: number;
  totalUsers: number;
  totalCollections: number;
  totalViews: number;
  totalBookmarks: number;

  // Daily statistics
  daily: {
    views: number;
    newUsers: number;
    newTitles: number;
    newChapters: number;
    chaptersRead: number;
  };

  // Weekly statistics
  weekly: {
    views: number;
    newUsers: number;
    newTitles: number;
    newChapters: number;
    chaptersRead: number;
  };

  // Monthly statistics
  monthly: {
    views: number;
    newUsers: number;
    newTitles: number;
    newChapters: number;
    chaptersRead: number;
  };

  // Popular content (top 10)
  popularTitles: {
    id: string;
    name: string;
    slug: string;
    views: number;
    dayViews: number;
    weekViews: number;
    monthViews: number;
  }[];

  popularChapters: {
    id: string;
    titleId: string;
    titleName: string;
    chapterNumber: number;
    name: string;
    views: number;
  }[];

  // Additional metrics
  activeUsersToday: number;
  newUsersThisMonth: number;
  totalRatings: number;
  averageRating: number;
  ongoingTitles: number;
  completedTitles: number;

  // Stale ongoing titles (no updates for over a month)
  staleOngoingTitles: number;
}

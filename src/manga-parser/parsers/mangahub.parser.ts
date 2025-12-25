/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { MangaParser, ParsedMangaData, ChapterInfo } from './base.parser';

@Injectable()
export class MangahubParser implements MangaParser {
  private session: AxiosInstance;

  constructor() {
    this.session = axios.create({
      timeout: 20000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
      },
    });
  }

  async parse(url: string): Promise<ParsedMangaData> {
    try {
      const slug = url.split('/manga/')[1]?.replace(/\/$/, '') || '';
      const domain = this.extractDomain(url);

      const graphqlUrl = `https://api.${domain.replace('v2.', '')}/graphql`;
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: `https://${domain}`,
        Referer: `https://${domain}/`,
      };

      // Get full manga data
      const mangaQuery = `
        query Manga($slug: String!) {
          manga(slug: $slug) {
            id
            originalName {
              content
              lang
            }
            titles {
              content
              lang
            }

            labels {
              titles {
                content
                lang
              }
            }
            branches {
              id
              primaryBranch
            }
            cover {
              original {
                url
              }
            }
          }
        }
      `;

      const mangaResponse = await this.session.post(
        graphqlUrl,
        {
          query: mangaQuery,
          variables: { slug },
        },
        { headers },
      );

      // Debug logging
      console.log('GraphQL URL:', graphqlUrl);
      console.log('Slug:', slug);
      console.log('Response status:', mangaResponse.status);
      console.log(
        'Response data:',
        JSON.stringify(mangaResponse.data, null, 2),
      );

      if (mangaResponse.data.errors) {
        console.log('GraphQL errors:', mangaResponse.data.errors);
        throw new Error(
          `GraphQL errors: ${JSON.stringify(mangaResponse.data.errors)}`,
        );
      }

      const mangaData = mangaResponse.data.data?.manga;
      if (!mangaData) {
        throw new Error('No manga data found');
      }

      // Extract title
      const title = this.extractTitle(mangaData);

      // Extract alternative titles
      const alternativeTitles = this.extractAlternativeTitles(mangaData);

      // Extract cover URL
      const coverUrl = this.extractCoverUrl(mangaData);

      // Extract genres
      const genres = this.extractGenres(mangaData);

      // Get chapters
      const chapters = await this.getChapters(mangaData, graphqlUrl, headers);

      return {
        title,
        alternativeTitles,
        description: undefined,
        coverUrl,
        genres,
        chapters,
      };
    } catch (error) {
      const errorDomain = this.extractDomain(url);
      throw new BadRequestException(
        `Failed to parse ${errorDomain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private extractTitle(mangaData: any): string {
    // Priority: RU title > EN title > originalName > first available title
    const ruTitle = mangaData.titles?.find(
      (t: any) => t.lang === 'RU',
    )?.content;
    if (ruTitle) return ruTitle;

    const enTitle = mangaData.titles?.find(
      (t: any) => t.lang === 'EN',
    )?.content;
    if (enTitle) return enTitle;

    const originalName = mangaData.originalName?.content;
    if (originalName) return originalName;

    const firstTitle = mangaData.titles?.[0]?.content;
    if (firstTitle) return firstTitle;

    return mangaData.slug || 'Unknown Title';
  }

  private extractAlternativeTitles(mangaData: any): string[] {
    const alternativeTitles: string[] = [];

    // Add all titles except RU (since RU is now main)
    const titles = mangaData.titles || [];
    for (const title of titles) {
      if (title.lang !== 'RU' && title.content) {
        alternativeTitles.push(title.content);
      }
    }

    // Add original name if different from main title
    const mainTitle = this.extractTitle(mangaData);
    const originalName = mangaData.originalName?.content;
    if (originalName && originalName !== mainTitle) {
      alternativeTitles.push(originalName);
    }

    return alternativeTitles;
  }

  private extractCoverUrl(mangaData: any): string | undefined {
    return mangaData.cover?.original?.url;
  }

  private extractGenres(mangaData: any): string[] {
    const labels = mangaData.labels || [];
    const genres: string[] = [];

    for (const label of labels) {
      const enTitle = label.titles?.find((t: any) => t.lang === 'EN')?.content;
      if (enTitle) {
        genres.push(enTitle);
      } else if (label.titles?.[0]?.content) {
        genres.push(label.titles[0].content);
      }
    }

    return genres.length > 0 ? genres : ['Unknown'];
  }

  private extractDomain(url: string): string {
    const urlObj = new URL(url);
    return urlObj.hostname;
  }

  private async getChapters(
    mangaData: any,
    graphqlUrl: string,
    headers: any,
  ): Promise<ChapterInfo[]> {
    const branches = mangaData.branches || [];
    console.log('Branches:', JSON.stringify(branches, null, 2));
    let branchId = branches.find((b: any) => b.primaryBranch)?.id;
    if (!branchId && branches.length > 0) {
      branchId = branches[0].id;
    }

    console.log('Selected branchId:', branchId);
    if (!branchId) {
      throw new Error('No branch ID found');
    }

    // Get chapters
    const chaptersQuery = `
      query ChaptersByBranch($branchId: ID!, $first: Int!, $after: String) {
        mangaChapters(branchId: $branchId, first: $first, after: $after) {
          edges {
            node {
              id
              slug
              name
              number
              createdAt
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const chapters: ChapterInfo[] = [];
    let hasNextPage = true;
    let after: string | undefined;

    while (hasNextPage) {
      const chaptersResponse = await this.session.post(
        graphqlUrl,
        {
          query: chaptersQuery,
          variables: { branchId, first: 100, after },
        },
        { headers },
      );

      const chaptersData = chaptersResponse.data.data?.mangaChapters;
      if (!chaptersData) break;

      for (const edge of chaptersData.edges) {
        const node = edge.node;
        const name = node.name || `Глава ${node.number}`;

        // Преобразуем номер главы в число и проверяем его корректность
        let chapterNumber: number | undefined;
        if (node.number !== undefined && node.number !== null) {
          const parsedNumber = parseFloat(node.number);
          if (!isNaN(parsedNumber)) {
            chapterNumber = parsedNumber;
          }
        }

        chapters.push({
          name,
          slug: node.slug,
          number: chapterNumber,
        });
      }

      hasNextPage = chaptersData.pageInfo.hasNextPage;
      after = chaptersData.pageInfo.endCursor;

      if (hasNextPage) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    chapters.reverse();
    return chapters;
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { MangaParser, ParsedMangaData, ChapterInfo } from './base.parser';

@Injectable()
export class SenkuroParser implements MangaParser {
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

      const graphqlUrl = `https://api.${domain}/graphql`;
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: `https://${domain}`,
        Referer: `https://${domain}/`,
      };

      // Get full manga data (все поля по ответу api.senkuro.me/graphql)
      const mangaQuery = `
        query Manga($slug: String!) {
          manga(slug: $slug) {
            id
            slug
            originalName {
              content
              lang
            }
            titles {
              content
              lang
            }
            alternativeNames {
              content
              lang
            }
            type
            releasedOn
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
            localizations {
              lang
              description {
                __typename
                ... on TiptapNodeNestedBlock {
                  type
                  content {
                    __typename
                    ... on TiptapNodeText {
                      type
                      text
                    }
                  }
                }
                ... on TiptapNodeText {
                  type
                  text
                }
              }
            }
            mainStaff {
              roles
              person {
                name
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

      if (mangaResponse.data.errors) {
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

      // Extract description (RU > EN > first available)
      const description = this.extractDescription(mangaData);

      // Author/artist from mainStaff (STORY -> author, ART -> artist)
      const { author, artist } = this.extractStaff(mangaData);

      // Type (MANHWA -> Manhwa, MANGA -> Manga, etc.) and release year
      const type = this.extractType(mangaData);
      const releaseYear = this.extractReleaseYear(mangaData);

      // Get chapters
      const chapters = await this.getChapters(mangaData, graphqlUrl, headers);

      return {
        title,
        alternativeTitles,
        description,
        coverUrl,
        genres,
        author,
        artist,
        type,
        releaseYear,
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
    const mainTitle = this.extractTitle(mangaData);
    const seen = new Set<string>([mainTitle]);

    const add = (content: string | undefined) => {
      if (content && !seen.has(content.trim())) {
        seen.add(content.trim());
        return content.trim();
      }
      return null;
    };

    const result: string[] = [];

    // Из titles — все кроме того, что выбран как main
    const titles = mangaData.titles || [];
    for (const t of titles) {
      if (t.content) {
        const v = add(t.content);
        if (v) result.push(v);
      }
    }

    // alternativeNames из API (отдельное поле с доп. названиями)
    const alternativeNames = mangaData.alternativeNames || [];
    for (const a of alternativeNames) {
      if (a.content) {
        const v = add(a.content);
        if (v) result.push(v);
      }
    }

    // originalName если ещё не добавлен
    const originalName = mangaData.originalName?.content;
    if (originalName) {
      const v = add(originalName);
      if (v) result.push(v);
    }

    return result;
  }

  private extractCoverUrl(mangaData: any): string | undefined {
    return mangaData.cover?.original?.url;
  }

  private extractDescription(mangaData: any): string | undefined {
    // Priority: RU > EN > first available
    const localizations = mangaData.localizations || [];
    const ruLoc = localizations.find((l: any) => l.lang === 'RU');
    if (ruLoc?.description) {
      return this.extractTextFromDescription(ruLoc.description);
    }

    const enLoc = localizations.find((l: any) => l.lang === 'EN');
    if (enLoc?.description) {
      return this.extractTextFromDescription(enLoc.description);
    }

    const firstLoc = localizations.find((l: any) => l.description);
    if (firstLoc?.description) {
      return this.extractTextFromDescription(firstLoc.description);
    }

    return undefined;
  }

  private extractTextFromDescription(description: any[]): string {
    if (!Array.isArray(description)) return '';

    return description
      .map((block: any) => {
        if (block.type === 'paragraph' && block.content) {
          return block.content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text)
            .join('');
        }
        return '';
      })
      .filter((text) => text.trim())
      .join('\n');
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

  /** Author (STORY), artist (ART) из mainStaff */
  private extractStaff(mangaData: any): {
    author?: string;
    artist?: string;
  } {
    const staff = mangaData.mainStaff || [];
    const authors: string[] = [];
    const artists: string[] = [];

    for (const s of staff) {
      const name = s.person?.name?.trim();
      if (!name) continue;
      const roles = (s.roles || []) as string[];
      if (roles.includes('STORY') && !authors.includes(name)) authors.push(name);
      if (roles.includes('ART') && !artists.includes(name)) artists.push(name);
    }

    return {
      author: authors.length > 0 ? authors.join(', ') : undefined,
      artist: artists.length > 0 ? artists.join(', ') : undefined,
    };
  }

  /** type: MANHWA -> Manhwa, MANGA -> Manga, COMIC -> Comic */
  private extractType(mangaData: any): string | undefined {
    const raw = mangaData.type;
    if (!raw || typeof raw !== 'string') return undefined;
    const map: Record<string, string> = {
      MANHWA: 'Manhwa',
      MANGA: 'Manga',
      COMIC: 'Comic',
      NOVEL: 'Novel',
    };
    return map[raw] ?? raw;
  }

  /** Год из releasedOn (например "2024-05-17" -> 2024) */
  private extractReleaseYear(mangaData: any): number | undefined {
    const dateStr = mangaData.releasedOn;
    if (!dateStr || typeof dateStr !== 'string') return undefined;
    const year = parseInt(dateStr.slice(0, 4), 10);
    return Number.isNaN(year) ? undefined : year;
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
    let branchId = branches.find((b: any) => b.primaryBranch)?.id;
    if (!branchId && branches.length > 0) {
      branchId = branches[0].id;
    }

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

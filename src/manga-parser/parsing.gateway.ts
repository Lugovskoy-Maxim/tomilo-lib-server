import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { MangaParserService } from './manga-parser.service';
import { ParseTitleDto } from './dto/parse-title.dto';
import { ParseChapterDto } from './dto/parse-chapter.dto';
import { ParseChaptersInfoDto } from './dto/parse-chapters-info.dto';
import {
  ParsingProgressDto,
  ChaptersInfoData,
  ChapterImportData,
  TitleImportData,
} from './dto/parsing-progress.dto';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/api/parsing',
})
export class ParsingGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ParsingGateway.name);

  constructor(private readonly mangaParserService: MangaParserService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private emitProgress(sessionId: string, progress: ParsingProgressDto): void {
    this.server.to(sessionId).emit('parsing_progress', progress);
  }

  @SubscribeMessage('parse_chapters_info')
  async handleParseChaptersInfo(
    @MessageBody() data: { dto: ParseChaptersInfoDto; sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { dto, sessionId } = data;
    client.join(sessionId);

    try {
      this.emitProgress(sessionId, {
        type: 'chapters_info',
        sessionId,
        status: 'started',
        message: 'Начинаем парсинг информации о главах...',
      });

      const result = await this.mangaParserService.parseChaptersInfo(dto);

      const chaptersData: ChaptersInfoData = {
        title: result.title,
        totalChapters: result.chapters.length,
        chapters: result.chapters.map((ch) => ({
          name: ch.name,
          number: ch.number || 0,
        })),
      };

      this.emitProgress(sessionId, {
        type: 'chapters_info',
        sessionId,
        status: 'completed',
        message: `Найдено ${result.chapters.length} глав для "${result.title}"`,
        data: chaptersData,
      });
    } catch (error) {
      this.emitProgress(sessionId, {
        type: 'chapters_info',
        sessionId,
        status: 'error',
        message: `Ошибка парсинга: ${
          error instanceof Error ? error.message : 'Неизвестная ошибка'
        }`,
      });
    }
  }

  @SubscribeMessage('parse_title')
  async handleParseTitle(
    @MessageBody() data: { dto: ParseTitleDto; sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { dto, sessionId } = data;
    client.join(sessionId);

    try {
      this.emitProgress(sessionId, {
        type: 'title_import',
        sessionId,
        status: 'started',
        message: 'Начинаем импорт тайтла...',
        data: { titleName: 'Парсинг...' } as TitleImportData,
      });

      // Override the service methods to emit progress
      const originalParseAndImportTitle =
        this.mangaParserService.parseAndImportTitle.bind(
          this.mangaParserService,
        );

      // Monkey patch for progress tracking
      this.mangaParserService.parseAndImportTitle = async (
        parseTitleDto: ParseTitleDto,
      ) => {
        // Emit parsing start
        this.emitProgress(sessionId, {
          type: 'title_import',
          sessionId,
          status: 'progress',
          message: 'Парсим информацию о тайтле...',
          data: {
            titleName: 'Парсинг...',
            status: 'parsing',
            currentStep: 1,
            totalSteps: 4,
          } as TitleImportData,
        });

        const parsedData = await this.mangaParserService
          .getParserForUrl(parseTitleDto.url)!
          .parse(parseTitleDto.url);

        // Emit cover download start
        this.emitProgress(sessionId, {
          type: 'title_import',
          sessionId,
          status: 'progress',
          message: 'Скачиваем обложку...',
          data: {
            titleName: parsedData.title,
            status: 'downloading_cover',
            currentStep: 2,
            totalSteps: 4,
          } as TitleImportData,
        });

        // Filter chapters if specific numbers requested
        let chapters = parsedData.chapters;
        if (
          parseTitleDto.chapterNumbers &&
          parseTitleDto.chapterNumbers.length > 0
        ) {
          const requestedNumbers = this.mangaParserService[
            'parseChapterNumbers'
          ](parseTitleDto.chapterNumbers);
          chapters = chapters.filter(
            (ch) => ch.number && requestedNumbers.has(ch.number),
          );
        }

        const totalChapters = chapters.length;

        const originalDownloadChapterImages = this.mangaParserService[
          'downloadChapterImages'
        ].bind(this.mangaParserService);
        const originalDownloadMangabuffChapterImages = this.mangaParserService[
          'downloadMangabuffChapterImages'
        ].bind(this.mangaParserService);
        const originalDownloadMangaShiChapterImages = this.mangaParserService[
          'downloadMangaShiChapterImages'
        ].bind(this.mangaParserService);
        const originalDownloadTelemangaChapterImages = this.mangaParserService[
          'downloadTelemangaChapterImages'
        ].bind(this.mangaParserService);

        let currentChapterIndex = 0;

        const emitChapterProgress = (
          chapter: any,
          message: string,
          status: 'importing_chapters' = 'importing_chapters',
        ) => {
          const num = chapter?.number ?? currentChapterIndex;
          const name = chapter?.name ?? `Глава ${num}`;
          this.emitProgress(sessionId, {
            type: 'title_import',
            sessionId,
            status: 'progress',
            message,
            data: {
              titleName: parsedData.title,
              status,
              currentStep: 3,
              totalSteps: 4,
              chapterProgress: {
                current: currentChapterIndex,
                total: totalChapters,
                percentage:
                  totalChapters > 0
                    ? Math.round((currentChapterIndex / totalChapters) * 100)
                    : 0,
              },
            } as TitleImportData,
          });
        };

        const wrapChapterDownload = <T>(
          chapter: any,
          fn: () => Promise<T>,
        ): Promise<T> => {
          currentChapterIndex++;
          const chapterNum = chapter?.number ?? currentChapterIndex;
          const chapterName = chapter?.name ?? `Глава ${chapterNum}`;
          emitChapterProgress(
            chapter,
            `Скачиваем главу ${chapterNum}: ${chapterName}`,
          );
          return fn()
            .then((result) => {
              emitChapterProgress(
                chapter,
                `Глава ${chapterNum} скачана`,
              );
              return result;
            })
            .catch((error) => {
              this.emitProgress(sessionId, {
                type: 'title_import',
                sessionId,
                status: 'progress',
                message: `Ошибка при скачивании главы ${chapterNum}`,
                data: {
                  titleName: parsedData.title,
                  status: 'importing_chapters',
                  currentStep: 3,
                  totalSteps: 4,
                  chapterProgress: {
                    current: currentChapterIndex,
                    total: totalChapters,
                    percentage:
                      totalChapters > 0
                        ? Math.round(
                            (currentChapterIndex / totalChapters) * 100,
                          )
                        : 0,
                  },
                } as TitleImportData,
              });
              throw error;
            });
        };

        this.mangaParserService['downloadChapterImages'] = async (
          chapter: any,
          chapterId: string,
          domain: string,
        ) =>
          wrapChapterDownload(chapter, () =>
            originalDownloadChapterImages(chapter, chapterId, domain),
          );

        this.mangaParserService['downloadMangabuffChapterImages'] = async (
          chapter: any,
          chapterId: string,
        ) =>
          wrapChapterDownload(chapter, () =>
            originalDownloadMangabuffChapterImages(chapter, chapterId),
          );

        this.mangaParserService['downloadMangaShiChapterImages'] = async (
          chapter: any,
          chapterId: string,
        ) =>
          wrapChapterDownload(chapter, () =>
            originalDownloadMangaShiChapterImages(chapter, chapterId),
          );

        this.mangaParserService['downloadTelemangaChapterImages'] = async (
          chapter: any,
          chapterId: string,
          mangaSlug: string,
        ) =>
          wrapChapterDownload(chapter, () =>
            originalDownloadTelemangaChapterImages(
              chapter,
              chapterId,
              mangaSlug,
            ),
          );

        const result = await originalParseAndImportTitle(parseTitleDto);

        this.mangaParserService['downloadChapterImages'] =
          originalDownloadChapterImages;
        this.mangaParserService['downloadMangabuffChapterImages'] =
          originalDownloadMangabuffChapterImages;
        this.mangaParserService['downloadMangaShiChapterImages'] =
          originalDownloadMangaShiChapterImages;
        this.mangaParserService['downloadTelemangaChapterImages'] =
          originalDownloadTelemangaChapterImages;

        // Emit completion
        this.emitProgress(sessionId, {
          type: 'title_import',
          sessionId,
          status: 'completed',
          message: `Импорт завершен: "${result.title.name}" с ${result.totalChapters} главами`,
          data: {
            titleName: result.title.name,
            status: 'completed',
            currentStep: 4,
            totalSteps: 4,
          } as TitleImportData,
        });

        return result;
      };

      const result = await this.mangaParserService.parseAndImportTitle(dto);

      // Restore original method
      this.mangaParserService.parseAndImportTitle = originalParseAndImportTitle;

      return result;
    } catch (error) {
      this.emitProgress(sessionId, {
        type: 'title_import',
        sessionId,
        status: 'error',
        message: `Ошибка импорта: ${
          error instanceof Error ? error.message : 'Неизвестная ошибка'
        }`,
      });
      throw error;
    }
  }

  @SubscribeMessage('parse_chapters')
  async handleParseChapters(
    @MessageBody() data: { dto: ParseChapterDto; sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { dto, sessionId } = data;
    client.join(sessionId);

    try {
      this.emitProgress(sessionId, {
        type: 'chapter_import',
        sessionId,
        status: 'started',
        message: 'Начинаем импорт глав...',
      });

      // Get chapters info first
      const chaptersInfo = await this.mangaParserService.parseChaptersInfo({
        url: dto.url,
        chapterNumbers: dto.chapterNumbers,
      });

      const totalChapters = chaptersInfo.chapters.length;

      // Override downloadChapterImages for progress tracking
      const originalDownloadChapterImages = this.mangaParserService[
        'downloadChapterImages'
      ].bind(this.mangaParserService);

      // Override downloadMangabuffChapterImages for progress tracking
      const originalDownloadMangabuffChapterImages = this.mangaParserService[
        'downloadMangabuffChapterImages'
      ].bind(this.mangaParserService);

      // Override downloadMangaShiChapterImages for progress tracking
      const originalDownloadMangaShiChapterImages = this.mangaParserService[
        'downloadMangaShiChapterImages'
      ].bind(this.mangaParserService);

      let currentChapterIndex = 0;

      this.mangaParserService['downloadChapterImages'] = async (
        chapter: any,
        chapterId: string,
        domain: string,
      ) => {
        currentChapterIndex++;
        const chapterData: ChapterImportData = {
          chapterNumber: chapter.number || 1,
          chapterName: chapter.name,
          status: 'downloading',
        };

        this.emitProgress(sessionId, {
          type: 'chapter_import',
          sessionId,
          status: 'progress',
          message: `Скачиваем главу ${chapterData.chapterNumber}: ${chapterData.chapterName}`,
          data: chapterData,
          progress: {
            current: currentChapterIndex,
            total: totalChapters,
            percentage: Math.round((currentChapterIndex / totalChapters) * 100),
          },
        });

        try {
          const result = await originalDownloadChapterImages(
            chapter,
            chapterId,
            domain,
          );

          chapterData.status = 'completed';
          this.emitProgress(sessionId, {
            type: 'chapter_import',
            sessionId,
            status: 'progress',
            message: `Глава ${chapterData.chapterNumber} скачана`,
            data: chapterData,
            progress: {
              current: currentChapterIndex,
              total: totalChapters,
              percentage: Math.round(
                (currentChapterIndex / totalChapters) * 100,
              ),
            },
          });

          return result;
        } catch (error) {
          chapterData.status = 'error';
          chapterData.error =
            error instanceof Error ? error.message : 'Unknown error';

          this.emitProgress(sessionId, {
            type: 'chapter_import',
            sessionId,
            status: 'progress',
            message: `Ошибка при скачивании главы ${chapterData.chapterNumber}`,
            data: chapterData,
            progress: {
              current: currentChapterIndex,
              total: totalChapters,
              percentage: Math.round(
                (currentChapterIndex / totalChapters) * 100,
              ),
            },
          });

          throw error;
        }
      };

      this.mangaParserService['downloadMangabuffChapterImages'] = async (
        chapter: any,
        chapterId: string,
      ) => {
        currentChapterIndex++;
        const chapterData: ChapterImportData = {
          chapterNumber: chapter.number || 1,
          chapterName: chapter.name,
          status: 'downloading',
        };

        this.emitProgress(sessionId, {
          type: 'chapter_import',
          sessionId,
          status: 'progress',
          message: `Скачиваем главу ${chapterData.chapterNumber}: ${chapterData.chapterName}`,
          data: chapterData,
          progress: {
            current: currentChapterIndex,
            total: totalChapters,
            percentage: Math.round((currentChapterIndex / totalChapters) * 100),
          },
        });

        try {
          const result = await originalDownloadMangabuffChapterImages(
            chapter,
            chapterId,
          );

          chapterData.status = 'completed';
          this.emitProgress(sessionId, {
            type: 'chapter_import',
            sessionId,
            status: 'progress',
            message: `Глава ${chapterData.chapterNumber} скачана`,
            data: chapterData,
            progress: {
              current: currentChapterIndex,
              total: totalChapters,
              percentage: Math.round(
                (currentChapterIndex / totalChapters) * 100,
              ),
            },
          });

          return result;
        } catch (error) {
          chapterData.status = 'error';
          chapterData.error =
            error instanceof Error ? error.message : 'Unknown error';

          this.emitProgress(sessionId, {
            type: 'chapter_import',
            sessionId,
            status: 'progress',
            message: `Ошибка при скачивании главы ${chapterData.chapterNumber}`,
            data: chapterData,
            progress: {
              current: currentChapterIndex,
              total: totalChapters,
              percentage: Math.round(
                (currentChapterIndex / totalChapters) * 100,
              ),
            },
          });

          throw error;
        }
      };

      this.mangaParserService['downloadMangaShiChapterImages'] = async (
        chapter: any,
        chapterId: string,
      ) => {
        currentChapterIndex++;
        const chapterData: ChapterImportData = {
          chapterNumber: chapter.number || 1,
          chapterName: chapter.name,
          status: 'downloading',
        };

        this.emitProgress(sessionId, {
          type: 'chapter_import',
          sessionId,
          status: 'progress',
          message: `Скачиваем главу ${chapterData.chapterNumber}: ${chapterData.chapterName}`,
          data: chapterData,
          progress: {
            current: currentChapterIndex,
            total: totalChapters,
            percentage: Math.round((currentChapterIndex / totalChapters) * 100),
          },
        });

        try {
          const result = await originalDownloadMangaShiChapterImages(
            chapter,
            chapterId,
          );

          chapterData.status = 'completed';
          this.emitProgress(sessionId, {
            type: 'chapter_import',
            sessionId,
            status: 'progress',
            message: `Глава ${chapterData.chapterNumber} скачана`,
            data: chapterData,
            progress: {
              current: currentChapterIndex,
              total: totalChapters,
              percentage: Math.round(
                (currentChapterIndex / totalChapters) * 100,
              ),
            },
          });

          return result;
        } catch (error) {
          chapterData.status = 'error';
          chapterData.error =
            error instanceof Error ? error.message : 'Unknown error';

          this.emitProgress(sessionId, {
            type: 'chapter_import',
            sessionId,
            status: 'progress',
            message: `Ошибка при скачивании главы ${chapterData.chapterNumber}`,
            data: chapterData,
            progress: {
              current: currentChapterIndex,
              total: totalChapters,
              percentage: Math.round(
                (currentChapterIndex / totalChapters) * 100,
              ),
            },
          });

          throw error;
        }
      };

      const result = await this.mangaParserService.parseAndImportChapters(dto);

      // Restore original methods
      this.mangaParserService['downloadChapterImages'] =
        originalDownloadChapterImages;
      this.mangaParserService['downloadMangabuffChapterImages'] =
        originalDownloadMangabuffChapterImages;
      this.mangaParserService['downloadMangaShiChapterImages'] =
        originalDownloadMangaShiChapterImages;

      this.emitProgress(sessionId, {
        type: 'chapter_import',
        sessionId,
        status: 'completed',
        message: `Импорт завершен: скачано ${result.length} глав`,
        progress: {
          current: totalChapters,
          total: totalChapters,
          percentage: 100,
        },
      });

      return result;
    } catch (error) {
      this.emitProgress(sessionId, {
        type: 'chapter_import',
        sessionId,
        status: 'error',
        message: `Ошибка импорта глав: ${
          error instanceof Error ? error.message : 'Неизвестная ошибка'
        }`,
      });
      throw error;
    }
  }
}

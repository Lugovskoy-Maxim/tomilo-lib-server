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
  IParsingProgressReporter,
  ParsingProgressDto,
  ChaptersInfoData,
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
  server!: Server;

  private readonly logger = new Logger(ParsingGateway.name);

  constructor(private readonly mangaParserService: MangaParserService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private createReporter(sessionId: string): IParsingProgressReporter {
    return {
      report: (progress: ParsingProgressDto) => {
        this.server.to(sessionId).emit('parsing_progress', progress);
      },
    };
  }

  @SubscribeMessage('parse_chapters_info')
  async handleParseChaptersInfo(
    @MessageBody() data: { dto: ParseChaptersInfoDto; sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { dto, sessionId } = data;
    client.join(sessionId);

    try {
      this.server.to(sessionId).emit('parsing_progress', {
        type: 'chapters_info',
        sessionId,
        status: 'started',
        message: 'Начинаем парсинг информации о главах...',
      });

      const result = await this.mangaParserService.parseChaptersInfo(dto);

      const chaptersData: ChaptersInfoData = {
        title: result.title ?? 'Неизвестный тайтл',
        totalChapters: result.chapters?.length ?? 0,
        chapters: (result.chapters ?? []).map((ch) => ({
          name: ch.name,
          number: ch.number || 0,
        })),
      };

      this.server.to(sessionId).emit('parsing_progress', {
        type: 'chapters_info',
        sessionId,
        status: 'completed',
        message: `Найдено ${result.chapters?.length ?? 0} глав для "${result.title ?? 'Неизвестный тайтл'}"`,
        data: chaptersData,
      });
    } catch (error) {
      this.server.to(sessionId).emit('parsing_progress', {
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

    const reporter = this.createReporter(sessionId);

    try {
      await this.mangaParserService.parseAndImportTitle(dto, {
        reporter,
        sessionId,
      });
    } catch (error) {
      reporter.report({
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

    const reporter = this.createReporter(sessionId);

    try {
      await this.mangaParserService.parseAndImportChapters(dto, {
        reporter,
        sessionId,
      });
    } catch (error) {
      reporter.report({
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

  /**
   * Парсинг нескольких тайтлов подряд. Отправляет в WebSocket события batch_import:
   * текущий тайтл (N из M), название, прогресс по главам внутри тайтла.
   */
  @SubscribeMessage('parse_batch')
  async handleParseBatch(
    @MessageBody()
    data: {
      dtos: ParseTitleDto[];
      sessionId: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { dtos, sessionId } = data;
    if (!Array.isArray(dtos) || dtos.length === 0) {
      this.server.to(sessionId).emit('parsing_progress', {
        type: 'batch_import',
        sessionId,
        status: 'error',
        message: 'Нет тайтлов для импорта',
      });
      return;
    }

    client.join(sessionId);
    const totalTitles = dtos.length;

    this.server.to(sessionId).emit('parsing_progress', {
      type: 'batch_import',
      sessionId,
      status: 'started',
      message: `Начинаем импорт ${totalTitles} тайтлов`,
      batch: {
        currentTitleIndex: 0,
        totalTitles,
      },
    });

    const reporter = this.createReporter(sessionId);

    for (let i = 0; i < dtos.length; i++) {
      const dto = dtos[i];
      const titleIndex = i + 1;

      reporter.report({
        type: 'batch_import',
        sessionId,
        status: 'progress',
        message: `Тайтл ${titleIndex} из ${totalTitles}: начинаем импорт...`,
        batch: {
          currentTitleIndex: titleIndex,
          totalTitles,
          currentTitleName: dto.customTitle ?? 'Парсинг...',
        },
      });

      const batchReporter: IParsingProgressReporter = {
        report: (p: ParsingProgressDto) => {
          if (p.type === 'title_import' && p.data) {
            const titleData = p.data as TitleImportData;
            reporter.report({
              ...p,
              type: 'batch_import',
              message: `Тайтл ${titleIndex} из ${totalTitles}: ${p.message}`,
              batch: {
                currentTitleIndex: titleIndex,
                totalTitles,
                currentTitleName: titleData.titleName,
                titleProgress: titleData.chapterProgress,
              },
            });
          } else {
            reporter.report(p);
          }
        },
      };

      try {
        const result = await this.mangaParserService.parseAndImportTitle(dto, {
          reporter: batchReporter,
          sessionId,
        });

        reporter.report({
          type: 'batch_import',
          sessionId,
          status: 'progress',
          message: `Тайтл ${titleIndex} из ${totalTitles} готов: "${result.title.name}" (${result.totalChapters} глав)`,
          batch: {
            currentTitleIndex: titleIndex,
            totalTitles,
            currentTitleName: result.title.name,
            titleProgress: {
              current: result.totalChapters,
              total: result.totalChapters,
              percentage: 100,
            },
          },
        });
      } catch (error) {
        reporter.report({
          type: 'batch_import',
          sessionId,
          status: 'progress',
          message: `Тайтл ${titleIndex} из ${totalTitles}: ошибка — ${
            error instanceof Error ? error.message : 'Неизвестная ошибка'
          }`,
          batch: {
            currentTitleIndex: titleIndex,
            totalTitles,
          },
        });
        this.logger.warn(
          `Batch parse title ${titleIndex}/${totalTitles} failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    reporter.report({
      type: 'batch_import',
      sessionId,
      status: 'completed',
      message: `Импорт завершён: обработано ${totalTitles} тайтлов`,
      batch: {
        currentTitleIndex: totalTitles,
        totalTitles,
      },
    });
  }
}

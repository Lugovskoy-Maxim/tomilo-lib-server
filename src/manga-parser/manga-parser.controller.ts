import {
  Controller,
  Post,
  Body,
  Get,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { MangaParserService } from './manga-parser.service';
import { ParseTitleDto } from './dto/parse-title.dto';
import { ParseChapterDto } from './dto/parse-chapter.dto';

@Controller('manga-parser')
export class MangaParserController {
  private readonly logger = new Logger(MangaParserController.name);

  constructor(private readonly mangaParserService: MangaParserService) {}

  @Post('parse-title')
  async parseAndImportTitle(@Body() parseTitleDto: ParseTitleDto) {
    try {
      this.logger.log(`Starting title import from: ${parseTitleDto.url}`);
      const result =
        await this.mangaParserService.parseAndImportTitle(parseTitleDto);
      this.logger.log(
        `Successfully imported title: ${result.title.name} with ${result.totalChapters} chapters`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to import title: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new HttpException(
        `Failed to import title: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('parse-chapters')
  async parseAndImportChapters(
    @Body() parseChapterDto: ParseChapterDto,
  ): Promise<any[]> {
    try {
      this.logger.log(`Starting chapters import from: ${parseChapterDto.url}`);
      const result =
        await this.mangaParserService.parseAndImportChapters(parseChapterDto);
      this.logger.log(`Successfully imported ${result.length} chapters`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to import chapters: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new HttpException(
        `Failed to import chapters: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('supported-sites')
  getSupportedSites() {
    return this.mangaParserService.getSupportedSites();
  }
}

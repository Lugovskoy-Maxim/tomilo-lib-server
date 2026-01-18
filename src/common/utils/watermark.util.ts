import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

// Используем default import для sharp
import sharp from 'sharp';

@Injectable()
export class WatermarkUtil {
  private readonly logger = new Logger(WatermarkUtil.name);
  private watermarkBuffer: Buffer | null = null;
  private watermarkPath = join(process.cwd(), 'watermark', 'watermark.png');

  // Добавляем геттер для проверки пути
  public getWatermarkPath(): string {
    return this.watermarkPath;
  }

  constructor() {
    this.initializeWatermark();
  }

  /**
   * Инициализация водяного знака
   */
  private initializeWatermark(): void {
    try {
      this.logger.log(
        `Проверяем наличие водяного знака по пути: ${this.watermarkPath}`,
      );
      if (existsSync(this.watermarkPath)) {
        // Загружаем водяной знак в буфер вместо хранения объекта Sharp
        this.watermarkBuffer = readFileSync(this.watermarkPath);
        this.logger.log('Водяной знак успешно загружен в буфер');
      } else {
        this.logger.warn(`Водяной знак не найден: ${this.watermarkPath}`);
      }
    } catch (error: any) {
      this.logger.error(`Ошибка загрузки водяного знака: ${error.message}`);
    }
  }

  /**
   * Добавляет водяной знак к изображению
   */
  async addWatermark(
    imageBuffer: Buffer,
    options: {
      position?:
        | 'top-left'
        | 'top-right'
        | 'bottom-left'
        | 'bottom-right'
        | 'center'
        | 'center-right';
      scale?: number;
      minHeight?: number; // Минимальная высота изображения для добавления водяного знака
      pageNumber?: number; // Номер страницы для определения четности
      applyEvenPageLogic?: boolean; // Применять ли логику четных/нечетных страниц
    } = {},
  ): Promise<Buffer> {
    try {
      this.logger.log(
        `Попытка добавления водяного знака. Загружен: ${this.watermarkBuffer ? 'да' : 'нет'}`,
      );

      // Проверяем, нужно ли применять логику четных/нечетных страниц
      const { applyEvenPageLogic = false, pageNumber } = options;

      if (applyEvenPageLogic && pageNumber !== undefined) {
        // Проверяем, является ли страница четной (страница четная, если номер четный: 2, 4, 6...)
        const isEvenPage = pageNumber % 2 === 0;

        if (!isEvenPage) {
          this.logger.log(
            `Страница ${pageNumber} нечетная, пропускаем добавление водяного знака`,
          );
          return imageBuffer;
        }
      }

      if (!this.watermarkBuffer) {
        this.logger.warn('Водяной знак не загружен, возвращаем оригинал');
        return imageBuffer;
      }

      const {
        position = 'center-right',
        scale = 0.35,
        minHeight = 3000,
      } = options;

      const mainImage = sharp(imageBuffer);
      const metadata = await mainImage.metadata();

      this.logger.log(
        `Размеры изображения: ${metadata.width}x${metadata.height}`,
      );

      if (!metadata.width || !metadata.height) {
        throw new Error('Не удалось получить размеры изображения');
      }

      // Проверяем минимальную высоту изображения
      if (metadata.height < minHeight) {
        this.logger.log(
          `Высота изображения (${metadata.height}) меньше минимальной (${minHeight}), водяной знак не добавляется`,
        );
        return imageBuffer;
      }

      // Рассчитываем размер водяного знака
      const watermarkWidth = Math.floor(metadata.width * scale);
      const watermarkMetadata = await sharp(this.watermarkBuffer).metadata();
      const watermarkHeight = Math.floor(
        (watermarkWidth * watermarkMetadata.height) / watermarkMetadata.width,
      );

      this.logger.log(
        `Размеры водяного знака: ${watermarkWidth}x${watermarkHeight}`,
      );

      // Изменяем размер водяного знака
      const resizedWatermark = await sharp(this.watermarkBuffer)
        .resize(watermarkWidth, watermarkHeight, {
          fit: 'contain',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();

      // Накладываем водяной знак
      const compositeImage = await mainImage
        .composite([
          {
            input: resizedWatermark,
            gravity: this.getGravity(position),
          },
        ])
        .png({ quality: 100 })
        .toBuffer();

      this.logger.log(`Водяной знак добавлен (позиция: ${position})`);
      // Ensure we're returning a Buffer type
      if (Buffer.isBuffer(compositeImage)) {
        return compositeImage;
      } else {
        // If for some reason compositeImage is not a Buffer, return the original image
        this.logger.warn(
          'Composite image is not a Buffer, returning original image',
        );
        return imageBuffer;
      }
    } catch (error: any) {
      this.logger.error(`Ошибка водяного знака: ${error.message}`);
      return imageBuffer;
    }
  }

  /**
   * Добавляет водяной знак к нескольким изображениям
   * С учетом новых требований:
   * - Ватермарка ставится только на четных страницах
   * - Ватермарка ставится в разных местах
   * - Ватермарка ставится только на изображениях шириной 4000px и более
   */
  async addWatermarkMultiple(
    imageBuffers: Buffer[],
    options: {
      scale?: number;
      minHeight?: number; // Минимальная высота изображения для добавления водяного знака
    } = {},
  ): Promise<Buffer[]> {
    this.logger.log(`=== НАЧАЛО addWatermarkMultiple ===`);
    this.logger.log(
      `Получено изображений для обработки: ${imageBuffers.length}`,
    );
    this.logger.log(`Опции: ${JSON.stringify(options)}`);
    this.logger.log(`Водяной знак загружен: ${this.isWatermarkLoaded()}`);

    const { scale = 0.35, minHeight = 4000 } = options;
    const results: Buffer[] = [];

    // Определяем позиции для водяных знаков
    const positions: Array<
      | 'top-left'
      | 'top-right'
      | 'bottom-left'
      | 'bottom-right'
      | 'center'
      | 'center-right'
    > = [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'center',
      'center-right',
    ];

    for (let i = 0; i < imageBuffers.length; i++) {
      this.logger.log(
        `Обрабатываем изображение ${i + 1}/${imageBuffers.length}`,
      );
      try {
        // Проверяем, является ли страница четной (индекс четный, так как индексация с 0)
        const isEvenPage = i % 2 === 1; // Страница четная, если индекс нечетный (1, 3, 5...)

        if (!isEvenPage) {
          this.logger.log(
            `Страница ${i + 1} нечетная, пропускаем добавление водяного знака`,
          );
          results.push(imageBuffers[i]);
          continue;
        }

        // Для четных страниц добавляем водяной знак
        // Выбираем позицию в зависимости от номера страницы
        const positionIndex = Math.floor(i / 2) % positions.length;
        const position = positions[positionIndex];

        this.logger.log(
          `Страница ${i + 1} четная, добавляем водяной знак в позиции: ${position}`,
        );

        const watermarkedImage = await this.addWatermark(imageBuffers[i], {
          position,
          scale,
          minHeight,
        });

        results.push(watermarkedImage);
        this.logger.log(`Изображение ${i + 1} успешно обработано`);
      } catch (error: any) {
        this.logger.error(
          `Ошибка обработки изображения ${i + 1}: ${error.message}`,
        );
        results.push(imageBuffers[i]);
      }
    }

    this.logger.log(
      `=== КОНЕЦ addWatermarkMultiple === Результат: ${results.length} изображений`,
    );
    return results;
  }

  /**
   * Конвертирует позицию в gravity для sharp
   */
  private getGravity(
    position:
      | 'top-left'
      | 'top-right'
      | 'bottom-left'
      | 'bottom-right'
      | 'center'
      | 'center-right',
  ): string {
    switch (position) {
      case 'top-left':
        return 'northwest';
      case 'top-right':
        return 'northeast';
      case 'bottom-left':
        return 'southwest';
      case 'bottom-right':
        return 'southeast';
      case 'center':
        return 'center';
      case 'center-right':
        return 'east';
      default:
        return 'southeast';
    }
  }

  /**
   * Перезагружает водяной знак
   */
  reloadWatermark(): void {
    this.watermarkBuffer = null;
    this.initializeWatermark();
  }

  /**
   * Проверяет, загружен ли водяной знак
   */
  isWatermarkLoaded(): boolean {
    return this.watermarkBuffer !== null;
  }
}

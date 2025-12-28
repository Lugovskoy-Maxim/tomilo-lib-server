import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';

// Используем default import для sharp
import sharp from 'sharp';

@Injectable()
export class WatermarkUtil {
  private readonly logger = new Logger(WatermarkUtil.name);
  private watermarkImage: any = null;
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
        this.watermarkImage = sharp(this.watermarkPath);
        this.logger.log('Водяной знак успешно загружен');
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
    } = {},
  ): Promise<Buffer> {
    try {
      this.logger.log(
        `Попытка добавления водяного знака. Загружен: ${this.watermarkImage ? 'да' : 'нет'}`,
      );

      if (!this.watermarkImage) {
        this.logger.warn('Водяной знак не загружен, возвращаем оригинал');
        return imageBuffer;
      }

      const { position = 'bottom-right', scale = 1 } = options;

      const mainImage = sharp(imageBuffer);
      const metadata = await mainImage.metadata();

      this.logger.log(
        `Размеры изображения: ${metadata.width}x${metadata.height}`,
      );

      if (!metadata.width || !metadata.height) {
        throw new Error('Не удалось получить размеры изображения');
      }

      // Подготавливаем водяной знак
      const watermarkBuffer = await this.watermarkImage
        .clone()
        .png()
        .toBuffer();

      // Рассчитываем размер
      const watermarkWidth = Math.floor(metadata.width * scale);
      const watermarkMetadata = await sharp(watermarkBuffer).metadata();
      const watermarkHeight = Math.floor(
        (watermarkWidth * watermarkMetadata.height) / watermarkMetadata.width,
      );

      this.logger.log(
        `Размеры водяного знака: ${watermarkWidth}x${watermarkHeight}`,
      );

      // Изменяем размер водяного знака
      const resizedWatermark = await sharp(watermarkBuffer)
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
      return compositeImage;
    } catch (error: any) {
      this.logger.error(`Ошибка водяного знака: ${error.message}`);
      return imageBuffer;
    }
  }

  /**
   * Добавляет водяной знак к нескольким изображениям
   */

  async addWatermarkMultiple(
    imageBuffers: Buffer[],
    options: {
      position?:
        | 'top-left'
        | 'top-right'
        | 'bottom-left'
        | 'bottom-right'
        | 'center'
        | 'center-right';
      scale?: number;
    } = {},
  ): Promise<Buffer[]> {
    this.logger.log(`=== НАЧАЛО addWatermarkMultiple ===`);
    this.logger.log(
      `Получено изображений для обработки: ${imageBuffers.length}`,
    );
    this.logger.log(`Опции: ${JSON.stringify(options)}`);
    this.logger.log(`Водяной знак загружен: ${this.isWatermarkLoaded()}`);

    const results: Buffer[] = [];

    for (let i = 0; i < imageBuffers.length; i++) {
      this.logger.log(
        `Обрабатываем изображение ${i + 1}/${imageBuffers.length}`,
      );
      try {
        const watermarkedImage = await this.addWatermark(
          imageBuffers[i],
          options,
        );
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

  private getGravity(position: string): string {
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
    this.watermarkImage = null;
    this.initializeWatermark();
  }

  /**
   * Проверяет, загружен ли водяной знак
   */
  isWatermarkLoaded(): boolean {
    return this.watermarkImage !== null;
  }
}

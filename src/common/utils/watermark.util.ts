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

  constructor() {
    this.initializeWatermark();
  }

  /**
   * Инициализация водяного знака
   */
  private initializeWatermark(): void {
    try {
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
        | 'center';
      scale?: number;
    } = {},
  ): Promise<Buffer> {
    try {
      if (!this.watermarkImage) {
        this.logger.warn('Водяной знак не загружен, возвращаем оригинал');
        return imageBuffer;
      }

      const { position = 'bottom-right', scale = 0.15 } = options;

      const mainImage = sharp(imageBuffer);
      const metadata = await mainImage.metadata();

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
        .jpeg({ quality: 90 })
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
        | 'center';
      scale?: number;
    } = {},
  ): Promise<Buffer[]> {
    const results: Buffer[] = [];

    for (const imageBuffer of imageBuffers) {
      try {
        const watermarkedImage = await this.addWatermark(imageBuffer, options);
        results.push(watermarkedImage);
      } catch (error: any) {
        this.logger.error(`Ошибка обработки: ${error.message}`);
        results.push(imageBuffer);
      }
    }

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

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { WatermarkUtil } from '../common/utils/watermark.util';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(private watermarkUtil: WatermarkUtil) {}

  async saveChapterPages(
    files: Express.Multer.File[],
    chapterId: string,
  ): Promise<string[]> {
    this.logger.log(`=== НАЧАЛО saveChapterPages ===`);
    this.logger.log(`Получено файлов: ${files?.length || 0}`);
    this.logger.log(`Chapter ID: ${chapterId}`);

    if (!files || files.length === 0) {
      this.logger.error('Нет файлов для загрузки - выбрасываем исключение');
      throw new BadRequestException('Нет файлов для загрузки');
    }

    const chapterDir = `chapters/${chapterId}`;
    const uploadPath = join('uploads', chapterDir);
    this.logger.log(`Путь для сохранения: ${uploadPath}`);

    // Создаем директорию для главы
    await fs.mkdir(uploadPath, { recursive: true });
    this.logger.log(`Директория создана: ${uploadPath}`);

    const pagePaths: string[] = [];

    // Сортируем файлы по имени для сохранения порядка
    const sortedFiles = files.sort((a, b) => {
      return a.originalname.localeCompare(b.originalname);
    });
    this.logger.log(`Файлы отсортированы. Количество: ${sortedFiles.length}`);

    // Подготавливаем буферы изображений для обработки водяным знаком
    const imageBuffers: Buffer[] = [];
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      this.logger.log(
        `Обрабатываем файл ${i + 1}: ${file.originalname}, размер: ${file.size} байт`,
      );

      let fileBuffer: Buffer;
      if (file.path) {
        this.logger.log(`Читаем файл из пути: ${file.path}`);
        fileBuffer = await fs.readFile(file.path);
      } else if (file.buffer) {
        this.logger.log(
          `Используем buffer файла, размер: ${file.buffer.length} байт`,
        );
        fileBuffer = file.buffer;
      } else {
        this.logger.error(`Отсутствует содержимое файла ${file.originalname}`);
        throw new BadRequestException('Отсутствует содержимое файла');
      }
      imageBuffers.push(fileBuffer);
      this.logger.log(
        `Файл ${file.originalname} добавлен в буфер, размер буфера: ${fileBuffer.length} байт`,
      );
    }

    this.logger.log(`Всего буферов подготовлено: ${imageBuffers.length}`);

    // Проверяем, загружен ли водяной знак
    this.logger.log(
      `Водяной знак загружен: ${this.watermarkUtil.isWatermarkLoaded()}`,
    );
    if (!this.watermarkUtil.isWatermarkLoaded()) {
      this.logger.warn('Водяной знак не загружен! Пытаемся перезагрузить...');
      this.watermarkUtil.reloadWatermark();
      this.logger.log(
        `После перезагрузки водяной знак загружен: ${this.watermarkUtil.isWatermarkLoaded()}`,
      );
    }

    // Добавляем водяной знак ко всем изображениям
    this.logger.log(
      `Добавляем водяной знак к ${imageBuffers.length} изображениям`,
    );
    const watermarkedBuffers = await this.watermarkUtil.addWatermarkMultiple(
      imageBuffers,
      {
        position: 'bottom-right',
        scale: 0.15, // 15% от ширины основного изображения
      },
    );
    this.logger.log(
      `Водяной знак добавлен к изображениям. Результат: ${watermarkedBuffers.length} изображений`,
    );

    // Сохраняем обработанные файлы
    for (let i = 0; i < watermarkedBuffers.length; i++) {
      const file = sortedFiles[i];
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `cover_${i + 1}.${fileExtension}`;
      const filePath = join(uploadPath, fileName);

      this.logger.log(
        `Сохраняем файл ${i + 1}: ${fileName} по пути: ${filePath}`,
      );

      // Сохраняем изображение с водяным знаком
      await fs.writeFile(filePath, watermarkedBuffers[i]);
      this.logger.log(`Файл ${fileName} сохранен успешно`);

      // Удаляем временный файл (если он был)
      if (file.path) {
        await fs.unlink(file.path);
        this.logger.log(`Временный файл ${file.path} удален`);
      }

      pagePaths.push(`/${chapterDir}/${fileName}`);
    }

    this.logger.log(
      `=== КОНЕЦ saveChapterPages === Всего сохранено страниц: ${pagePaths.length}`,
    );
    return pagePaths;
  }

  async deleteChapterPages(chapterId: string): Promise<void> {
    const chapterDir = join('uploads', 'chapters', chapterId);

    try {
      await fs.rm(chapterDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Ошибка при удалении директории: ${error}`);
    }
  }
  async saveUserAvatar(
    file: Express.Multer.File,
    userId: string,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('Нет файла для загрузки');
    }

    // Проверяем тип файла
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Файл должен быть изображением');
    }

    const userDir = `users/${userId}/avatar`;
    const uploadPath = join('uploads', userDir);

    try {
      // Создаем директорию для аватара пользователя
      await fs.mkdir(uploadPath, { recursive: true });

      // Удаляем старый аватар, если он существует
      await this.deleteUserAvatar(userId);

      // Получаем расширение файла
      const fileExtension = file.originalname.split('.').pop() || 'jpg';

      // Формируем имя файла: avatar.{ext}
      const fileName = `avatar.${fileExtension}`;
      const filePath = join(uploadPath, fileName);

      // Сохраняем файл
      if (file.path) {
        try {
          await fs.rename(file.path, filePath);
        } catch {
          const fileContent = await fs.readFile(file.path);
          await fs.writeFile(filePath, fileContent);
          await fs.unlink(file.path);
        }
      } else if (file.buffer) {
        await fs.writeFile(filePath, file.buffer);
      } else {
        throw new BadRequestException('Отсутствует содержимое файла');
      }

      // Возвращаем относительный путь
      return `/${userDir}/${fileName}`;
    } catch (error) {
      this.logger.error(
        `Ошибка при сохранении аватара: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        `Не удалось сохранить аватар: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async deleteUserAvatar(userId: string): Promise<void> {
    const userAvatarDir = join('uploads', 'users', userId, 'avatar');

    try {
      await fs.access(userAvatarDir);
      const files = await fs.readdir(userAvatarDir);

      // Удаляем все файлы в папке аватара
      const deletePromises = files.map((file) =>
        fs.unlink(join(userAvatarDir, file)),
      );

      await Promise.all(deletePromises);
      this.logger.log(`Аватар пользователя ${userId} успешно удален`);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        this.logger.warn(
          `Директория аватара пользователя ${userId} не найдена`,
        );
      } else {
        this.logger.error(
          `Ошибка при удалении аватара: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  async getUserAvatarPath(userId: string): Promise<string | null> {
    const userAvatarDir = join('uploads', 'users', userId, 'avatar');

    try {
      await fs.access(userAvatarDir);
      const files = await fs.readdir(userAvatarDir);

      // Ищем файл аватара (обычно avatar.*)
      const avatarFile = files.find((file) => file.startsWith('avatar.'));

      if (avatarFile) {
        return `/uploads/users/${userId}/avatar/${avatarFile}`;
      }

      return null;
    } catch {
      return null;
    }
  }

  async deleteUserFolder(userId: string): Promise<void> {
    const userDir = join('uploads', 'users', userId);

    try {
      await fs.access(userDir);
      await fs.rm(userDir, { recursive: true, force: true });
      this.logger.log(`Директория пользователя ${userId} успешно удалена`);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        this.logger.warn(`Директория пользователя ${userId} не найдена`);
      } else {
        this.logger.error(
          `Ошибка при удалении директории пользователя: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  async downloadImageFromUrl(
    imageUrl: string,
    chapterId: string,
    pageNumber: number,
    options?: {
      headers?: {
        Referer?: string;
        Accept?: string;
        'Sec-Fetch-Dest'?: string;
        'Sec-Fetch-Mode'?: string;
        'Sec-Fetch-Site'?: string;
      };
    },
  ): Promise<string> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
          ...options?.headers,
        },
      });

      const chapterDir = `chapters/${chapterId}`;
      const uploadPath = join('uploads', chapterDir);

      // Создаем директорию для главы
      await fs.mkdir(uploadPath, { recursive: true });

      // Определяем расширение файла
      const urlPath = new URL(imageUrl).pathname;
      const ext = urlPath.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `${pageNumber.toString().padStart(3, '0')}.${ext}`;
      const filePath = join(uploadPath, fileName);

      // Сохраняем файл
      await fs.writeFile(filePath, response.data);

      return `/${chapterDir}/${fileName}`;
    } catch (error) {
      this.logger.error(
        `Failed to download image ${imageUrl}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw new BadRequestException(
        `Failed to download image: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async downloadTitleCover(imageUrl: string, titleId: string): Promise<string> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
        },
      });

      const titleDir = `titles/${titleId}`;
      const uploadPath = join('uploads', titleDir);

      // Создаем директорию для тайтла
      await fs.mkdir(uploadPath, { recursive: true });

      // Определяем расширение файла
      const urlPath = new URL(imageUrl).pathname;
      const ext = urlPath.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `cover.${ext}`;
      const filePath = join(uploadPath, fileName);

      // Сохраняем файл
      await fs.writeFile(filePath, response.data);

      return `/uploads/${titleDir}/${fileName}`;
    } catch (error) {
      this.logger.error(
        `Failed to download title cover ${imageUrl}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw new BadRequestException(
        `Failed to download title cover: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async deleteTitleCover(titleId: string): Promise<void> {
    const titleDir = join('uploads', 'titles', titleId);

    try {
      await fs.access(titleDir);
      await fs.rm(titleDir, { recursive: true, force: true });
      this.logger.log(`Title cover directory ${titleId} successfully deleted`);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        this.logger.warn(`Title cover directory ${titleId} not found`);
      } else {
        this.logger.error(
          `Error deleting title cover directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }
}

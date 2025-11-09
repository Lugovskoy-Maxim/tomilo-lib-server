import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import axios from 'axios';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  async saveChapterPages(
    files: Express.Multer.File[],
    chapterId: string,
  ): Promise<string[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Нет файлов для загрузки');
    }

    const chapterDir = `chapters/${chapterId}`;
    const uploadPath = join('uploads', chapterDir);

    // Создаем директорию для главы
    await fs.mkdir(uploadPath, { recursive: true });

    const pagePaths: string[] = [];

    // Сортируем файлы по имени для сохранения порядка
    const sortedFiles = files.sort((a, b) => {
      return a.originalname.localeCompare(b.originalname);
    });

    // Сохраняем файлы и возвращаем пути
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `cover_${i + 1}.${fileExtension}`;
      const filePath = join(uploadPath, fileName);

      // Для diskStorage используем path вместо buffer
      if (file.path) {
        // Копируем файл из временного местоположения в целевую папку
        const fileContent = await fs.readFile(file.path);
        await fs.writeFile(filePath, fileContent);

        // Удаляем временный файл (опционально)
        await fs.unlink(file.path);
      } else if (file.buffer) {
        // Для memoryStorage используем buffer
        await fs.writeFile(filePath, file.buffer);
      } else {
        throw new BadRequestException('Отсутствует содержимое файла');
      }

      pagePaths.push(`/${chapterDir}/${fileName}`);
    }

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
  ): Promise<string> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
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

      return `/${titleDir}/${fileName}`;
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

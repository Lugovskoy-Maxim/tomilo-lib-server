import { Injectable, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class FilesService {
  async saveChapterPages(
    files: Express.Multer.File[],
    chapterId: string,
  ): Promise<string[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
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
      const fileName = `page_${i + 1}.${fileExtension}`;
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
        throw new BadRequestException('File data is missing');
      }

      pagePaths.push(`/uploads/${chapterDir}/${fileName}`);
    }

    return pagePaths;
  }

  async deleteChapterPages(chapterId: string): Promise<void> {
    const chapterDir = join('uploads', 'chapters', chapterId);

    try {
      await fs.rm(chapterDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Error deleting chapter directory: ${error}`);
    }
  }
}

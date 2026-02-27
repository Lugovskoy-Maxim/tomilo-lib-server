import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { WatermarkUtil } from '../common/utils/watermark.util';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private watermarkUtil: WatermarkUtil,
    private s3Service: S3Service,
  ) {}

  private useS3(): boolean {
    return this.s3Service.isConfigured();
  }

  /**
   * Сохраняет файл локально и асинхронно дублирует в S3 (если настроен).
   * Всегда возвращает локальный путь — S3 используется как зеркало.
   * Загрузка в S3 не блокирует ответ сервера.
   */
  private async saveFileWithBackup(
    buffer: Buffer,
    localPath: string,
    s3Key: string,
    contentType: string,
  ): Promise<string> {
    await fs.mkdir(join('uploads', ...localPath.split('/').slice(0, -1)), {
      recursive: true,
    });
    const fullLocalPath = join('uploads', localPath);
    await fs.writeFile(fullLocalPath, buffer);
    this.logger.log(`Файл сохранен локально: ${fullLocalPath}`);

    if (this.useS3()) {
      this.uploadToS3Async(s3Key, buffer, contentType);
    }

    return `/${localPath}`;
  }

  /**
   * Асинхронная загрузка в S3 (fire-and-forget).
   * Не блокирует основной поток, ошибки логируются.
   */
  private uploadToS3Async(
    s3Key: string,
    buffer: Buffer,
    contentType: string,
  ): void {
    this.s3Service
      .uploadFile(s3Key, buffer, contentType)
      .then(() => {
        this.logger.log(`[S3 async] Файл загружен: ${s3Key}`);
      })
      .catch((error) => {
        this.logger.error(`[S3 async] Ошибка загрузки ${s3Key}: ${error}`);
      });
  }

  /**
   * Удаляет файл локально и асинхронно из S3 (если настроен).
   */
  private async deleteFileWithBackup(
    localPath: string,
    s3Key: string,
  ): Promise<void> {
    const fullLocalPath = join('uploads', localPath);
    try {
      await fs.unlink(fullLocalPath);
      this.logger.log(`Локальный файл удален: ${fullLocalPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.error(`Ошибка удаления локального файла: ${error}`);
      }
    }

    if (this.useS3()) {
      this.deleteFromS3Async(s3Key);
    }
  }

  /**
   * Асинхронное удаление из S3 (fire-and-forget).
   */
  private deleteFromS3Async(s3Key: string): void {
    this.s3Service
      .deleteFile(s3Key)
      .then(() => {
        this.logger.log(`[S3 async] Файл удален: ${s3Key}`);
      })
      .catch((error) => {
        this.logger.error(`[S3 async] Ошибка удаления ${s3Key}: ${error}`);
      });
  }

  /**
   * Удаляет папку локально и асинхронно из S3 (если настроен).
   */
  private async deleteFolderWithBackup(
    localDir: string,
    s3Prefix: string,
  ): Promise<void> {
    const fullLocalPath = join('uploads', localDir);
    try {
      await fs.rm(fullLocalPath, { recursive: true, force: true });
      this.logger.log(`Локальная папка удалена: ${fullLocalPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.error(`Ошибка удаления локальной папки: ${error}`);
      }
    }

    if (this.useS3()) {
      this.deleteFolderFromS3Async(s3Prefix);
    }
  }

  /**
   * Асинхронное удаление папки из S3 (fire-and-forget).
   */
  private deleteFolderFromS3Async(s3Prefix: string): void {
    this.s3Service
      .deleteFolder(s3Prefix)
      .then(() => {
        this.logger.log(`[S3 async] Папка удалена: ${s3Prefix}`);
      })
      .catch((error) => {
        this.logger.error(`[S3 async] Ошибка удаления папки ${s3Prefix}: ${error}`);
      });
  }

  async saveChapterPages(
    files: Express.Multer.File[],
    chapterId: string,
    titleId: string,
  ): Promise<string[]> {
    this.logger.log(`=== НАЧАЛО saveChapterPages ===`);
    this.logger.log(`Получено файлов: ${files?.length || 0}`);
    this.logger.log(`Chapter ID: ${chapterId}, Title ID: ${titleId}`);
    this.logger.log(`Используем S3: ${this.useS3()}`);

    if (!files || files.length === 0) {
      this.logger.error('Нет файлов для загрузки - выбрасываем исключение');
      throw new BadRequestException('Нет файлов для загрузки');
    }

    const chapterDir = `titles/${titleId}/chapters/${chapterId}`;
    const pagePaths: string[] = [];

    const sortedFiles = files.sort((a, b) => {
      return a.originalname.localeCompare(b.originalname);
    });
    this.logger.log(`Файлы отсортированы. Количество: ${sortedFiles.length}`);

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

    this.logger.log(
      `Водяной знак загружен: ${this.watermarkUtil.isWatermarkLoaded()}`,
    );
    this.logger.log(
      `Верхний водяной знак загружен: ${this.watermarkUtil.isWatermarkTopLoaded()}`,
    );
    if (
      !this.watermarkUtil.isWatermarkLoaded() ||
      !this.watermarkUtil.isWatermarkTopLoaded()
    ) {
      this.logger.warn('Водяные знаки не загружены! Пытаемся перезагрузить...');
      this.watermarkUtil.reloadWatermark();
      this.logger.log(
        `После перезагрузки водяной знак загружен: ${this.watermarkUtil.isWatermarkLoaded()}`,
      );
      this.logger.log(
        `После перезагрузки верхний водяной знак загружен: ${this.watermarkUtil.isWatermarkTopLoaded()}`,
      );
    }

    this.logger.log(
      `Добавляем водяной знак к ${imageBuffers.length} изображениям`,
    );

    let watermarkedBuffers: Buffer[] = [];
    try {
      watermarkedBuffers = await this.watermarkUtil.addWatermarkMultiple(
        imageBuffers,
        {
          scale: 0.35,
          minHeight: 2000,
        },
      );
      this.logger.log(
        `Водяной знак добавлен к изображениям. Результат: ${watermarkedBuffers.length} изображений`,
      );

      for (let i = 0; i < watermarkedBuffers.length; i++) {
        const file = sortedFiles[i];
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `cover_${i + 1}.${fileExtension}`;
        const contentType = file.mimetype || 'image/jpeg';

        this.logger.log(`Сохраняем файл ${i + 1}: ${fileName}`);

        const localPath = `${chapterDir}/${fileName}`;
        const s3Key = `${chapterDir}/${fileName}`;

        const resultUrl = await this.saveFileWithBackup(
          watermarkedBuffers[i],
          localPath,
          s3Key,
          contentType,
        );
        pagePaths.push(resultUrl);

        if (file.path) {
          await fs.unlink(file.path);
          this.logger.log(`Временный файл ${file.path} удален`);
        }
      }

      this.logger.log(
        `=== КОНЕЦ saveChapterPages === Всего сохранено страниц: ${pagePaths.length}`,
      );

      return pagePaths;
    } finally {
      imageBuffers.length = 0;
      watermarkedBuffers.length = 0;
      this.watermarkUtil.dispose();
    }
  }

  async deleteChapterPages(chapterId: string, titleId?: string): Promise<void> {
    if (titleId) {
      await this.deleteFolderWithBackup(
        `titles/${titleId}/chapters/${chapterId}`,
        `titles/${titleId}/chapters/${chapterId}`,
      );
    }
    await this.deleteFolderWithBackup(
      `chapters/${chapterId}`,
      `chapters/${chapterId}`,
    );
  }

  async saveUserAvatar(
    file: Express.Multer.File,
    userId: string,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('Нет файла для загрузки');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Файл должен быть изображением');
    }

    const fileExtension = file.originalname.split('.').pop() || 'jpg';
    const fileName = `avatar.${fileExtension}`;

    let fileBuffer: Buffer;
    if (file.path) {
      fileBuffer = await fs.readFile(file.path);
    } else if (file.buffer) {
      fileBuffer = file.buffer;
    } else {
      throw new BadRequestException('Отсутствует содержимое файла');
    }

    try {
      await this.deleteUserAvatar(userId);

      const localPath = `users/${userId}/avatar/${fileName}`;
      const s3Key = `users/${userId}/avatar/${fileName}`;

      const resultUrl = await this.saveFileWithBackup(
        fileBuffer,
        localPath,
        s3Key,
        file.mimetype,
      );

      if (file.path) {
        await fs.unlink(file.path);
      }

      return resultUrl;
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
    await this.deleteFolderWithBackup(
      `users/${userId}/avatar`,
      `users/${userId}/avatar`,
    );
  }

  async getUserAvatarPath(userId: string): Promise<string | null> {
    if (this.useS3()) {
      const files = await this.s3Service.listFiles(`users/${userId}/avatar/`);
      const avatarFile = files.find((f) => f.includes('avatar.'));
      if (avatarFile) {
        return this.s3Service.getPublicUrl(avatarFile);
      }
      return null;
    }

    const userAvatarDir = join('uploads', 'users', userId, 'avatar');

    try {
      await fs.access(userAvatarDir);
      const files = await fs.readdir(userAvatarDir);

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
    await this.deleteFolderWithBackup(`users/${userId}`, `users/${userId}`);
  }

  async downloadImageFromUrl(
    imageUrl: string,
    chapterId: string,
    pageNumber: number,
    titleId: string,
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
    this.logger.log(`=== НАЧАЛО downloadImageFromUrl ===`);
    this.logger.log(`URL: ${imageUrl}`);
    this.logger.log(`Chapter ID: ${chapterId}, Title ID: ${titleId}`);
    this.logger.log(`Page Number: ${pageNumber}`);
    this.logger.log(`Используем S3: ${this.useS3()}`);

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

      const chapterDir = `titles/${titleId}/chapters/${chapterId}`;

      const urlPath = new URL(imageUrl).pathname;
      const ext = urlPath.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `${pageNumber.toString().padStart(3, '0')}.${ext}`;

      this.logger.log(
        `Загружено изображение, размер: ${response.data.length} байт`,
      );

      this.logger.log(
        `Водяной знак загружен: ${this.watermarkUtil.isWatermarkLoaded()}`,
      );
      this.logger.log(
        `Верхний водяной знак загружен: ${this.watermarkUtil.isWatermarkTopLoaded()}`,
      );
      if (
        !this.watermarkUtil.isWatermarkLoaded() ||
        !this.watermarkUtil.isWatermarkTopLoaded()
      ) {
        this.logger.warn(
          'Водяные знаки не загружены! Пытаемся перезагрузить...',
        );
        this.watermarkUtil.reloadWatermark();
        this.logger.log(
          `После перезагрузки водяной знак загружен: ${this.watermarkUtil.isWatermarkLoaded()}`,
        );
        this.logger.log(
          `После перезагрузки верхний водяной знак загружен: ${this.watermarkUtil.isWatermarkTopLoaded()}`,
        );
      }

      const imageBuffer = Buffer.from(response.data);
      this.logger.log(
        `Применяем водяной знак к изображению (страница ${pageNumber})`,
      );

      let watermarkedBuffer: Buffer;

      if (pageNumber === 1) {
        this.logger.log(
          `Страница 1 - добавляем верхний и обычный водяной знак`,
        );

        watermarkedBuffer =
          await this.watermarkUtil.addTopWatermark(imageBuffer);

        watermarkedBuffer = await this.watermarkUtil.addWatermark(
          watermarkedBuffer,
          {
            position: 'center-right',
            scale: 0.35,
            minHeight: 2000,
          },
        );
      } else {
        watermarkedBuffer = await this.watermarkUtil.addWatermark(imageBuffer, {
          position: 'center-right',
          scale: 0.35,
          minHeight: 2000,
          pageNumber: pageNumber,
          applyEvenPageLogic: true,
        });
      }

      this.logger.log(`Водяной знак применен успешно`);

      const localPath = `${chapterDir}/${fileName}`;
      const s3Key = `${chapterDir}/${fileName}`;
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const resultPath = await this.saveFileWithBackup(
        watermarkedBuffer,
        localPath,
        s3Key,
        contentType,
      );

      watermarkedBuffer = null as any;
      this.watermarkUtil.dispose();

      this.logger.log(`=== КОНЕЦ downloadImageFromUrl ===`);
      return resultPath;
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
      const urlObj = new URL(imageUrl);
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
      };
      if (urlObj.hostname === 'manga-shi.org') {
        headers['Referer'] = 'https://manga-shi.org/';
      }
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers,
      });

      const titleDir = `titles/${titleId}`;
      const ext = urlObj.pathname.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `cover.${ext}`;
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const localPath = `${titleDir}/${fileName}`;
      const s3Key = `${titleDir}/${fileName}`;

      return this.saveFileWithBackup(
        Buffer.from(response.data),
        localPath,
        s3Key,
        contentType,
      );
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
    await this.deleteFolderWithBackup(`titles/${titleId}`, `titles/${titleId}`);
  }

  async saveTitleCoverFromFile(
    file: Express.Multer.File,
    titleId: string,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('Нет файла для загрузки');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Файл должен быть изображением');
    }

    const ext = file.originalname.split('.').pop() || 'jpg';
    const fileName = `cover.${ext}`;

    let fileBuffer: Buffer;
    if (file.path) {
      fileBuffer = await fs.readFile(file.path);
    } else if (file.buffer) {
      fileBuffer = file.buffer;
    } else {
      throw new BadRequestException('Отсутствует содержимое файла');
    }

    const localPath = `titles/${titleId}/${fileName}`;
    const s3Key = `titles/${titleId}/${fileName}`;

    const resultUrl = await this.saveFileWithBackup(
      fileBuffer,
      localPath,
      s3Key,
      file.mimetype,
    );

    if (file.path) {
      await fs.unlink(file.path);
    }

    return resultUrl;
  }

  async saveAnnouncementImage(
    file: Express.Multer.File,
    announcementId?: string,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('Нет файла для загрузки');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Файл должен быть изображением');
    }

    const subDir = announcementId
      ? `announcements/${announcementId}`
      : 'announcements';

    const ext = file.originalname.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

    let fileBuffer: Buffer;
    if (file.path) {
      fileBuffer = await fs.readFile(file.path);
    } else if (file.buffer) {
      fileBuffer = file.buffer;
    } else {
      throw new BadRequestException('Отсутствует содержимое файла');
    }

    const localPath = `${subDir}/${fileName}`;
    const s3Key = `${subDir}/${fileName}`;

    const resultUrl = await this.saveFileWithBackup(
      fileBuffer,
      localPath,
      s3Key,
      file.mimetype,
    );

    if (file.path) {
      await fs.unlink(file.path);
    }

    return resultUrl;
  }

  async deleteAnnouncementImages(announcementId: string): Promise<void> {
    await this.deleteFolderWithBackup(
      `announcements/${announcementId}`,
      `announcements/${announcementId}`,
    );
  }

  async saveDecorationImage(file: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('Нет файла для загрузки');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Файл должен быть изображением');
    }

    const ext = file.originalname.split('.').pop() || 'png';
    const fileName = `decoration-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

    let fileBuffer: Buffer;
    if (file.path) {
      fileBuffer = await fs.readFile(file.path);
    } else if (file.buffer) {
      fileBuffer = file.buffer;
    } else {
      throw new BadRequestException('Отсутствует содержимое файла');
    }

    const localPath = `decorations/${fileName}`;
    const s3Key = `decorations/${fileName}`;

    const resultUrl = await this.saveFileWithBackup(
      fileBuffer,
      localPath,
      s3Key,
      file.mimetype,
    );

    if (file.path) {
      await fs.unlink(file.path);
    }

    return resultUrl;
  }

  async deleteDecorationImage(imagePath: string): Promise<void> {
    let key: string;
    if (imagePath.startsWith('http')) {
      const url = new URL(imagePath);
      key = url.pathname.replace(/^\//, '');
    } else {
      key = imagePath.replace(/^\//, '');
    }

    await this.deleteFileWithBackup(key, key);
  }

  async saveCollectionCover(
    file: Express.Multer.File,
    collectionId: string,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('Нет файла для загрузки');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Файл должен быть изображением');
    }

    const ext = file.originalname.split('.').pop() || 'jpg';
    const fileName = `cover.${ext}`;

    let fileBuffer: Buffer;
    if (file.path) {
      fileBuffer = await fs.readFile(file.path);
    } else if (file.buffer) {
      fileBuffer = file.buffer;
    } else {
      throw new BadRequestException('Отсутствует содержимое файла');
    }

    const localPath = `collections/${collectionId}/${fileName}`;
    const s3Key = `collections/${collectionId}/${fileName}`;

    const resultUrl = await this.saveFileWithBackup(
      fileBuffer,
      localPath,
      s3Key,
      file.mimetype,
    );

    if (file.path) {
      await fs.unlink(file.path);
    }

    return resultUrl;
  }

  async deleteCollectionCover(collectionId: string): Promise<void> {
    await this.deleteFolderWithBackup(
      `collections/${collectionId}`,
      `collections/${collectionId}`,
    );
  }

  disposeWatermarkResources(): void {
    this.watermarkUtil.dispose();
  }
}

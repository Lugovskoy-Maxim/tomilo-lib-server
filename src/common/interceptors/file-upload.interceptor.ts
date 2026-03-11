import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BadRequestException } from '@nestjs/common';

export class FileUploadInterceptor {
  static create(
    field: string,
    options: {
      destination?: string;
      fileTypes: RegExp;
      fileSize: number;
      filenamePrefix?: string;
    },
  ) {
    return FileInterceptor(field, {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const isImage = file.mimetype.startsWith('image/');
        const matchesRegex = options.fileTypes
          ? file.mimetype.match(options.fileTypes)
          : true;
        if (!isImage && !matchesRegex) {
          return cb(
            new BadRequestException(
              `Only image files are allowed (got ${file.mimetype})`,
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: options.fileSize,
      },
    });
  }

  static createMultiple(
    field: string,
    options: {
      destination?: string;
      fileTypes: RegExp;
      fileSize: number;
      filenamePrefix?: string;
      maxFiles?: number;
    },
  ) {
    return FilesInterceptor(field, options.maxFiles || 10, {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const isImage = file.mimetype.startsWith('image/');
        const matchesRegex = options.fileTypes
          ? file.mimetype.match(options.fileTypes)
          : true;
        if (!isImage && !matchesRegex) {
          return cb(
            new BadRequestException(
              `Only image files are allowed (got ${file.mimetype})`,
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: options.fileSize,
      },
    });
  }
}

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
        if (!file.mimetype.match(options.fileTypes)) {
          return cb(
            new BadRequestException(
              `Only files with types ${options.fileTypes} are allowed`,
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
        if (!file.mimetype.match(options.fileTypes)) {
          return cb(
            new BadRequestException(
              `Only files with types ${options.fileTypes} are allowed`,
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

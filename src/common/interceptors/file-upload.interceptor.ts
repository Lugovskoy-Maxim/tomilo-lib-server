import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';

export class FileUploadInterceptor {
  static create(
    field: string,
    options: {
      destination: string;
      fileTypes: RegExp;
      fileSize: number;
      filenamePrefix?: string;
    },
  ) {
    return FileInterceptor(field, {
      storage: diskStorage({
        destination: options.destination,
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const prefix = options.filenamePrefix
            ? options.filenamePrefix + '-'
            : '';
          cb(null, prefix + uniqueSuffix + extname(file.originalname));
        },
      }),
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
      destination: string;
      fileTypes: RegExp;
      fileSize: number;
      filenamePrefix?: string;
      maxFiles?: number;
    },
  ) {
    return FilesInterceptor(field, options.maxFiles || 10, {
      storage: diskStorage({
        destination: options.destination,
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const prefix = options.filenamePrefix
            ? options.filenamePrefix + '-'
            : '';
          cb(null, prefix + uniqueSuffix + extname(file.originalname));
        },
      }),
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

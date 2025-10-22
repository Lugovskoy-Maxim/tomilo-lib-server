import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';

export const multerConfig = {
  storage: diskStorage({
    destination: './uploads/chapters',
    filename: (req, file, cb) => {
      const randomName = randomUUID();
      cb(null, `${randomName}${extname(file.originalname)}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  },
  limits: {
    fileSize: 15 * 1024 * 1024, // 10 MB
  },
};

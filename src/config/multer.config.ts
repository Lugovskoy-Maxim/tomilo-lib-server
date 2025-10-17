import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

export const multerConfig = {
  storage: diskStorage({
    destination: './uploads/chapters',
    filename: (req, file, cb) => {
      const randomName = uuidv4();
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

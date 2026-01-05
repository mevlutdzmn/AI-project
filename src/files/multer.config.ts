import { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Detect if running on Vercel
const isVercel = !!process.env.VERCEL;

export const multerConfig: MulterModuleOptions = {
  limits: { fileSize: 10 * 1024 * 1024 },
  storage: isVercel
    ? memoryStorage() // Use memory storage on Vercel
    : diskStorage({
        destination: (req, file, cb) => {
          const dest = process.env.UPLOAD_DIR || './uploads';
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          cb(null, dest);
        },
        filename: (req, file, cb) => {
          // ✅ Security: Use crypto.randomBytes instead of Math.random
          const randomName = crypto.randomBytes(16).toString('hex');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
};

import { Injectable } from '@nestjs/common';

@Injectable()
export class UploadService {
  buildPublicResponse(file: Express.Multer.File) {
    const fileUrl = `/uploads/${file.filename}`;
    return {
      url: fileUrl,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
    };
  }
}

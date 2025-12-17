import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { UploadService } from './upload.service';
import axios from 'axios';

// Detect if running on Vercel
const isVercel = !!process.env.VERCEL;

// ✅ Security: İzin verilen MIME tipleri ve uzantılar
const ALLOWED_MIMETYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.txt',
  '.json',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
];

// ✅ Security: Dosya filtresi
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const ext = extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(
      new HttpException(
        `İzin verilmeyen dosya uzantısı: ${ext}`,
        HttpStatus.BAD_REQUEST,
      ),
      false,
    );
  }

  if (!ALLOWED_MIMETYPES.includes(mime)) {
    return cb(
      new HttpException(
        `İzin verilmeyen dosya tipi: ${mime}`,
        HttpStatus.BAD_REQUEST,
      ),
      false,
    );
  }

  cb(null, true);
};

// Multer configuration for local development
const localMulterOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const dest = process.env.UPLOAD_DIR || './uploads';
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const randomName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');
      cb(null, `${randomName}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter, // ✅ Security: Dosya filtresi eklendi
};

// Multer configuration for Vercel (memory storage)
const vercelMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter, // ✅ Security: Dosya filtresi eklendi
};

@ApiTags('Files')
@Controller('files')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}
  @Post('upload')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'No file uploaded' })
  @UseInterceptors(
    FileInterceptor(
      'file',
      isVercel ? vercelMulterOptions : localMulterOptions,
    ),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    let fileUrl: string;

    // If running on Vercel, upload to Vercel Blob Storage
    if (isVercel) {
      try {
        const { put } = await import('@vercel/blob');
        const randomName = Array(32)
          .fill(null)
          .map(() => Math.round(Math.random() * 16).toString(16))
          .join('');
        const fileName = `${randomName}${extname(file.originalname)}`;

        const blob = await put(fileName, file.buffer, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });

        fileUrl = blob.url;
      } catch (error) {
        console.error('Error uploading to Vercel Blob:', error);
        throw new HttpException(
          'Failed to upload file',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } else {
      // Local development - file is already saved to disk
      fileUrl = `${process.env.BACKEND_URL || 'http://localhost:4000'}/uploads/${file.filename}`;
    }

    // Check if it's a text-based file and read its content
    const textMimeTypes = [
      'text/',
      'application/json',
      'application/xml',
      'application/javascript',
      'application/typescript',
    ];
    const isTextFile = textMimeTypes.some((type) =>
      file.mimetype.startsWith(type),
    );

    let fileContent: string | null = null;
    if (isTextFile) {
      try {
        if (isVercel) {
          // Read from buffer on Vercel
          if (file.buffer && file.size < 50 * 1024) {
            fileContent = file.buffer.toString('utf-8');
          }
        } else {
          // Read from disk on local
          const stats = fs.statSync(file.path);
          if (stats.size < 50 * 1024) {
            fileContent = fs.readFileSync(file.path, 'utf-8');
          }
        }
      } catch (error) {
        console.error('Error reading file content:', error);
      }
    }

    return {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: fileUrl,
      content: fileContent,
    };
  }

  @Post('save-image-url')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download image from URL and save to server' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          description: 'URL of the image to download and save',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Image saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid URL' })
  async saveImageFromUrl(@Body('imageUrl') imageUrl: string, @Req() req) {
    if (!imageUrl) {
      throw new HttpException('Image URL is required', HttpStatus.BAD_REQUEST);
    }

    try {
      // Basic validation: only allow http/https
      const urlObj = new URL(imageUrl);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new HttpException('Invalid URL protocol', HttpStatus.BAD_REQUEST);
      }

      // Prevent SSRF to private networks/localhost
      const hostname = urlObj.hostname.toLowerCase();
      const privateHosts = ['localhost', '127.0.0.1'];
      const privateCidrs = [
        /^10\./,
        /^192\.168\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^169\.254\./,
      ];
      if (
        privateHosts.includes(hostname) ||
        privateCidrs.some((re) => re.test(hostname))
      ) {
        throw new HttpException(
          'Blocked private network access',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Download image from URL
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        // Ensure we only accept images
        headers: { Accept: 'image/*' },
      });

      const contentType = response.headers['content-type'] || '';
      if (!contentType.startsWith('image/')) {
        throw new HttpException('URL is not an image', HttpStatus.BAD_REQUEST);
      }

      // Enforce max size (10MB)
      const contentLength = parseInt(
        response.headers['content-length'] || '0',
        10,
      );
      if (contentLength && contentLength > 10 * 1024 * 1024) {
        throw new HttpException('Image too large', HttpStatus.BAD_REQUEST);
      }

      const buffer = Buffer.from(response.data);
      const randomName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');
      const fileName = `${randomName}.png`;

      let savedUrl: string;

      if (isVercel) {
        // Upload to Vercel Blob Storage
        const { put } = await import('@vercel/blob');
        const blob = await put(fileName, buffer, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        savedUrl = blob.url;
      } else {
        // Save to local uploads folder
        const dest = process.env.UPLOAD_DIR || './uploads';
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        const filePath = `${dest}/${fileName}`;
        fs.writeFileSync(filePath, buffer);
        savedUrl = `${process.env.BACKEND_URL || 'http://localhost:4000'}/uploads/${fileName}`;
      }

      return {
        success: true,
        url: savedUrl,
        filename: fileName,
      };
    } catch (error) {
      console.error('Error saving image from URL:', error);
      throw new HttpException(
        'Failed to save image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

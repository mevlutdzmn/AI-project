import {
    Controller,
    Post,
    UploadedFile,
    UseInterceptors,
    UseGuards,
    Req,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { UploadService } from './upload.service';

// Detect if running on Vercel
const isVercel = !!process.env.VERCEL;

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
};

// Multer configuration for Vercel (memory storage)
const vercelMulterOptions = {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
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
        FileInterceptor('file', isVercel ? vercelMulterOptions : localMulterOptions),
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
                throw new HttpException('Failed to upload file', HttpStatus.INTERNAL_SERVER_ERROR);
            }
        } else {
            // Local development - file is already saved to disk
            fileUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/uploads/${file.filename}`;
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
}

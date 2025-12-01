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
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { UploadService } from './upload.service';

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
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads',
                filename: (req, file, cb) => {
                    const randomName = Array(32)
                        .fill(null)
                        .map(() => Math.round(Math.random() * 16).toString(16))
                        .join('');
                    return cb(null, `${randomName}${extname(file.originalname)}`);
                },
            }),
            limits: { fileSize: 10 * 1024 * 1024 },
        }),
    )
    async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req) {
        if (!file) {
            throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
        }

        const fileUrl = `/uploads/${file.filename}`;

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
                // Read file content (limit to 50KB to avoid huge files)
                const stats = fs.statSync(file.path);
                if (stats.size < 50 * 1024) {
                    // 50KB limit
                    fileContent = fs.readFileSync(file.path, 'utf-8');
                }
            } catch (error) {
                console.error('Error reading file content:', error);
            }
        }

        return {
            ...this.uploadService.buildPublicResponse(file),
            content: fileContent,
        };
    }
}

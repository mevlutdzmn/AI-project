import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * DTO for image URL in multipart messages
 */
class ImageUrlDto {
  @IsString()
  @IsNotEmpty()
  url: string;
}

/**
 * DTO for individual message parts (text or image)
 * Supports ChatGPT-style multipart messages
 */
class MessagePartDto {
  @IsString()
  @IsIn(['text', 'image_url'])
  type: 'text' | 'image_url';

  @ValidateIf((o) => o.type === 'text')
  @IsString()
  text?: string;

  @ValidateIf((o) => o.type === 'image_url')
  @ValidateNested()
  @Type(() => ImageUrlDto)
  image_url?: ImageUrlDto;
}

/**
 * Send message DTO with proper type safety
 * Supports both simple string messages and multipart (text + images)
 */
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  /**
   * Message content - can be:
   * 1. Simple string: "Hello"
   * 2. Multipart array: [{ type: 'text', text: 'Hello' }, { type: 'image_url', image_url: { url: '...' } }]
   */
  @Transform(({ value }) => {
    // If it's a string, keep as string
    if (typeof value === 'string') return value;
    // If it's an array, validate each part
    if (Array.isArray(value)) return value;
    // Otherwise stringify
    return String(value);
  })
  @ValidateIf((o) => typeof o.message === 'string')
  @IsString()
  @IsNotEmpty()
  message: string | MessagePartDto[];

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  @IsIn(['chat', 'image', 'research', 'agent', 'web', 'canvas'])
  mode?: 'chat' | 'image' | 'research' | 'agent' | 'web' | 'canvas';
}

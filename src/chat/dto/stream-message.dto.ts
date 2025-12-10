import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class StreamMessageDto {
  @IsOptional()
  @IsString()
  sessionId?: string; // ✅ Optional - null olabilir, ChatGPT tarzı yeni session için

  @IsNotEmpty()
  message: any; // Can be string or array of content parts

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  mode?: string;
}

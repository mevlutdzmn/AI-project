import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class StreamMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsNotEmpty()
  message: any; // Can be string or array of content parts

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  mode?: string;
}

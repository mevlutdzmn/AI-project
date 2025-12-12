import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  // message can be string or structured array; keep as any for now
  @IsNotEmpty()
  message: any;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  mode?: string;
}

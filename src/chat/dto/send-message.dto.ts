import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  // message can be string or structured array; keep as any for now
  message: any;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  mode?: string;
}

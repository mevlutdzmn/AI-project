import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsBoolean,
  IsOptional,
  IsDateString,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'user@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(255, { message: 'Email must be at most 255 characters' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'SecureP@ss123', description: 'New password' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must be at most 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ example: false, description: 'Is admin user' })
  @IsBoolean({ message: 'isAdmin must be a boolean' })
  @IsOptional()
  isAdmin?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Is user active' })
  @IsBoolean({ message: 'active must be a boolean' })
  @IsOptional()
  active?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Is premium user' })
  @IsBoolean({ message: 'isPremium must be a boolean' })
  @IsOptional()
  isPremium?: boolean;

  @ApiPropertyOptional({ example: 30, description: 'Premium days to add' })
  @IsOptional()
  premiumDays?: number;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z', description: 'Subscription expiry date' })
  @IsDateString({}, { message: 'Invalid date format' })
  @IsOptional()
  subscriptionExpiresAt?: string;
}

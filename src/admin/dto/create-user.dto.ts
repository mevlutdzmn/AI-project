import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsBoolean,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(255, { message: 'Email must be at most 255 characters' })
  email!: string;

  @ApiProperty({ example: 'SecureP@ss123', description: 'User password' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must be at most 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password!: string;

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
}

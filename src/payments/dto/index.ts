import { IsNumber, IsOptional, IsEmail } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsOptional()
  @IsNumber()
  amount?: number;
}

export class InitiatePaymentDto {
  @IsNumber()
  userId: number;

  @IsEmail()
  email: string;

  @IsOptional()
  plan?: string;
}

export class ActivateAccountDto {
  @IsEmail()
  email: string;

  authority: string;

  @IsOptional()
  password?: string;
}

export class ContinuePaymentDto {
  @IsEmail()
  email: string;
}

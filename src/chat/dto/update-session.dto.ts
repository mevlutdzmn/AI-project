import { IsString, MaxLength } from 'class-validator';

export class UpdateSessionDto {
  @IsString()
  @MaxLength(100)
  title!: string;
}

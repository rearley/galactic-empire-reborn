import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Matches(/^[\x21-\x7E]{3,16}$/)
  @IsString()
  username!: string;

  @MaxLength(72)
  @MinLength(8)
  @IsString()
  password!: string;
}

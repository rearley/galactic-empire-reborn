import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @MaxLength(254) // RFC 5321 max path length
  @IsEmail()
  email!: string;

  @MaxLength(72) // bcrypt truncates beyond 72 bytes
  @MinLength(8)
  @IsString()
  password!: string;
}

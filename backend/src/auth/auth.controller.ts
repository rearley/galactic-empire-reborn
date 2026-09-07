import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthValidationFilter, authValidationExceptionFactory } from './auth-validation.filter';

/**
 * HTTP auth endpoints. JWT is returned on both register and login.
 * @see specs/011-onboarding/contracts/http-auth.md
 */
@Controller('auth')
@UseFilters(AuthValidationFilter)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(
    new ValidationPipe({ whitelist: true, exceptionFactory: authValidationExceptionFactory }),
  )
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @UsePipes(
    new ValidationPipe({ whitelist: true, exceptionFactory: authValidationExceptionFactory }),
  )
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}

import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChooseUsernameDto } from './dto/choose-username.dto';
import { AuthValidationFilter, authValidationExceptionFactory } from './auth-validation.filter';

/**
 * HTTP auth endpoints. JWT is returned on both register and login.
 *
 * `ThrottlerGuard` is applied here only — scoped to this controller, not
 * registered globally (`AppModule` has no `APP_GUARD`) — because this is
 * the first internet-reachable, unauthenticated write surface in the app.
 * See `auth.constants.ts` `AUTH_THROTTLE_*` for the limit and why.
 *
 * @see specs/011-onboarding/contracts/http-auth.md
 */
@Controller('auth')
@UseFilters(AuthValidationFilter)
@UseGuards(ThrottlerGuard)
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

  @Post('username')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(
    new ValidationPipe({ whitelist: true, exceptionFactory: authValidationExceptionFactory }),
  )
  async chooseUsername(
    @Req() req: { user: { sub: string } },
    @Body() dto: ChooseUsernameDto,
  ) {
    return this.authService.chooseUsername(req.user.sub, dto);
  }
}

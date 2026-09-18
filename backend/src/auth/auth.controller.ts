import { Get, Body, Controller, HttpCode, Post, Req, UseFilters, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isSysopUsername } from './sysop';
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

  /**
   * Who am I, and may I see the reports?
   *
   * Exists so the site chrome can decide whether to offer the sysop their
   * Reports link without guessing. The answer is COSMETIC — `ReportsController`
   * asks the same question again and is the thing that actually refuses — but a
   * button that 403s when pressed is worse than no button.
   *
   * Reads the username from the TOKEN rather than the database: it is already
   * in the payload, and one more query per page load buys nothing.
   */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@Req() req: { user: { sub: string; username: string | null } }): {
    username: string | null;
    sysop: boolean;
  } {
    return {
      username: req.user.username ?? null,
      sysop: isSysopUsername(req.user.username),
    };
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

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
   * Reads the username from the DATABASE rather than the token: the claim is a
   * 30-day-old copy, and `null` on a token minted before registration step 2,
   * either of which silently answers "not the sysop" for a session that is.
   */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Req() req: { user: { sub: string; username: string | null } }): Promise<{
    username: string | null;
    sysop: boolean;
  }> {
    // Read live, not from the token. The claim is a 30-day-old copy and is
    // `null` for an account that had not finished step 2 when it was minted,
    // so trusting it makes the sysop link disappear for a stale session and
    // stay gone until the next login. @see auth/sysop.ts
    const username = await this.authService.usernameOf(req.user.sub);
    return { username, sysop: isSysopUsername(username) };
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

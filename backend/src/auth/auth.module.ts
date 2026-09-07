import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { WsAuthGuard } from './ws-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { JWT_EXPIRES_IN, AUTH_THROTTLE_TTL_MS, AUTH_THROTTLE_LIMIT } from './auth.constants';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is required');
        return { secret, signOptions: { expiresIn: JWT_EXPIRES_IN } };
      },
    }),
    // Scoped to this module only — ThrottlerGuard is applied on
    // AuthController alone (see its @UseGuards), not registered as a global
    // APP_GUARD, so no other route in the app is affected.
    // /auth/* is about to be internet-reachable for the first time and
    // bcrypt cost 12 (~300ms) on a libuv thread pool of 4 means ~15
    // unauthenticated requests/second from any source saturates the same
    // process the game tick runs on; registration was previously unbounded.
    // AUTH_THROTTLE_LIMIT requests per AUTH_THROTTLE_TTL_MS per caller (per
    // route — register/login/username each get their own bucket) keeps
    // sustained abuse from one source far below that, while still being
    // generous enough for a person who fumbles their password a few times.
    ThrottlerModule.forRoot([{ ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, WsAuthGuard],
  exports: [AuthService, JwtModule, WsAuthGuard],
})
export class AuthModule {}

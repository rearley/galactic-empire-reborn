import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { WsAuthGuard } from './ws-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { JWT_EXPIRES_IN } from './auth.constants';

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
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, WsAuthGuard],
  exports: [AuthService, JwtModule, WsAuthGuard],
})
export class AuthModule {}

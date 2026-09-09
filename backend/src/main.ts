import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { debugEndpointsEnabled } from './debug/debug-endpoints';
import { configureHttpSecurity } from './http-security';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Behind <panel>'s nginx the auth throttler saw the proxy's address for every
  // caller, so the whole internet shared one 10-per-minute bucket.
  // @see src/http-security.ts
  configureHttpSecurity(app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void });
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`[Bootstrap] Listening on http://localhost:${port}`);

  // Loud on purpose: these routes take a ship NAME and have no authentication,
  // so while they are mounted anyone who can reach the port can teleport,
  // re-hull, repair or bankroll any ship in the galaxy.
  if (debugEndpointsEnabled()) {
    console.warn(
      '[Bootstrap] *** GE_DEBUG_ENDPOINTS is on: /debug/* cheat routes are mounted and UNAUTHENTICATED. ***',
    );
    console.warn('[Bootstrap] *** Do not expose this port. Unset GE_DEBUG_ENDPOINTS to remove them. ***');
  }
}

bootstrap().catch((err: unknown) => {
  console.error('[Bootstrap] Fatal startup error:', err);
  process.exit(1);
});

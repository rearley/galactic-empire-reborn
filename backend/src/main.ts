import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`[Bootstrap] Listening on http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('[Bootstrap] Fatal startup error:', err);
  process.exit(1);
});

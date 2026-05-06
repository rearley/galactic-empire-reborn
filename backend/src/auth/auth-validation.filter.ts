import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Reformats NestJS ValidationPipe errors on auth routes to our contract shape:
 * `{ code: 'INVALID_USERNAME' | 'INVALID_PASSWORD', message: string }`.
 *
 * The standard ValidationPipe emits `{ statusCode, message: string[], error }`.
 * We need a single `code` field so the frontend can react without parsing message strings.
 */
@Catch(BadRequestException)
export class AuthValidationFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const body = exception.getResponse() as Record<string, unknown>;

    // If this is a plain object we already formatted (from our custom pipe), pass through
    if (typeof body.code === 'string') {
      res.status(400).json(body);
      return;
    }

    // NestJS ValidationPipe default format: { statusCode, message: string[], error }
    const messages = Array.isArray(body.message) ? (body.message as string[]) : [];
    const hasUsernameError = messages.some(
      (m) => m.toLowerCase().includes('username') || m.toLowerCase().includes('match')
    );
    const code = hasUsernameError ? 'INVALID_USERNAME' : 'INVALID_PASSWORD';
    res.status(400).json({ code, message: `${code}` });
  }
}

import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ValidationError,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Custom `exceptionFactory` for the `ValidationPipe` on the auth routes.
 *
 * The default factory flattens `ValidationError[]` down to a `string[]` of
 * human messages and discards which DTO property actually failed. We need
 * the property name intact so {@link AuthValidationFilter} can classify the
 * failure by field rather than by scanning message text (which broke the day
 * `RegisterDto`/`LoginDto` grew an `email` field: no message-substring rule
 * had ever been written for it, so every email failure silently fell through
 * to the `INVALID_PASSWORD` bucket).
 */
export function authValidationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    properties: errors.map((e) => e.property),
    message: 'Validation failed',
  });
}

/**
 * Human-readable sentence for each validation `code` this filter emits.
 * `code` is the contract the frontend and tests key off of — never change
 * those strings. `message` is what a player actually reads, so it must read
 * like something a person wrote, not the machine code (a stranger's first
 * screen must not show them the literal text "INVALID_EMAIL").
 */
const VALIDATION_MESSAGES: Record<'INVALID_EMAIL' | 'INVALID_PASSWORD' | 'INVALID_USERNAME', string> = {
  INVALID_EMAIL: 'Enter a valid email address.',
  INVALID_PASSWORD: 'Password must be at least 8 characters.',
  INVALID_USERNAME: 'Enter a valid username.',
};

/**
 * Reformats NestJS ValidationPipe errors on auth routes to our contract shape:
 * `{ code: 'INVALID_EMAIL' | 'INVALID_PASSWORD' | 'INVALID_USERNAME', message: string }`.
 *
 * Classification reads the failing DTO property directly off the
 * `properties` array produced by {@link authValidationExceptionFactory} —
 * not by pattern-matching the validation message text, which is fragile and
 * has already broken once (see that function's doc comment). `username`
 * has no route today (`RegisterDto`/`LoginDto` are email-only), but a later
 * task adds one that validates a username field and needs this code.
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

    const properties = Array.isArray(body.properties) ? (body.properties as unknown[]) : [];
    const failedFields = new Set(properties.map(String));

    const code = failedFields.has('email')
      ? 'INVALID_EMAIL'
      : failedFields.has('username')
        ? 'INVALID_USERNAME'
        : 'INVALID_PASSWORD';

    res.status(400).json({ code, message: VALIDATION_MESSAGES[code] });
  }
}

import { Controller, Get, Header } from '@nestjs/common';
import { buildGuide, Guide } from './guide';

/**
 * The public player's guide.
 *
 * Unauthenticated, and static for the life of the process: it is generated
 * from CANON_HELP, which is compiled into the image. So it is built once at
 * construction and served from memory — no cache expiry, because nothing can
 * change it short of a redeploy, and a redeploy replaces the process.
 */
@Controller('public')
export class GuideController {
  private readonly guide: Guide = buildGuide();

  @Get('guide')
  @Header('Cache-Control', 'public, max-age=3600')
  getGuide(): Guide {
    return this.guide;
  }
}

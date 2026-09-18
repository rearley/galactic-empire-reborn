import { Controller, Get, Header } from '@nestjs/common';
import { buildChangelog, Changelog } from './changelog';

/**
 * The public changelog.
 *
 * Unauthenticated and static for the life of the process, exactly like the
 * guide: the entries are compiled into the image, so nothing short of a
 * redeploy can change them — and a redeploy replaces the process.
 */
@Controller('public')
export class ChangelogController {
  private readonly changelog: Changelog = buildChangelog();

  // A minute, not the guide's hour. This is the page whose entire job is
  // saying what just shipped, and the browser cache outlives the deploy: a
  // player who read it before a release would be told for another hour that
  // the release they are looking at does not exist. Caught in a browser —
  // the page served a stale body for the version it was published in.
  @Get('changelog')
  @Header('Cache-Control', 'public, max-age=60')
  getChangelog(): Changelog {
    return this.changelog;
  }
}

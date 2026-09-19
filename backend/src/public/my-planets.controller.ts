import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PlanetStateService } from '../game/planet/planet-state.service';
import { MyPlanet, ownedPlanetsFor } from './my-planets';

/** The JWT payload the strategy hands back. @see auth/jwt.strategy.ts */
interface AuthedRequest {
  user: { sub: string; username: string | null };
}

/**
 * The signed-in player's colonies, for the calculator.
 *
 * Its own controller rather than a route on `CalculatorController`, because
 * the guard belongs on the whole class and the calculator must stay open to
 * visitors who have not enlisted. Mounted under `/public/` because nginx
 * proxies only `/auth/`, `/admin/`, `/public/` and `/socket.io/`.
 *
 * Read from `PlanetStateService`, not Postgres: the in-memory map is the source
 * of truth and the database lags it by a flush. The owner comes from the token
 * and nowhere else — the request names no planet, so it cannot name someone
 * else's.
 */
@Controller('public')
@UseGuards(AuthGuard('jwt'))
export class MyPlanetsController {
  constructor(private readonly planets: PlanetStateService) {}

  @Get('my-planets')
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthedRequest): MyPlanet[] {
    return ownedPlanetsFor(req.user.sub, this.planets.all());
  }
}

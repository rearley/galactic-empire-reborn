import { Body, Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import {
  buildPlanetModel,
  simulate,
  CalculatorInput,
  CalculatorResult,
  PlanetModel,
} from './calculator';

/**
 * The public planet calculator.
 *
 * Unauthenticated, like the guide and the stats page — it exists so a player
 * who has not enlisted can work out whether a colony is worth founding, and so
 * nobody has to reverse-engineer `multiply()` from the C source to plan a rate
 * budget.
 *
 * Stateless in both directions: nothing is read from or written to the
 * database, and the POST is a pure function of its body. It is a POST only
 * because the input is fourteen stock figures and fourteen rates, which do not
 * belong in a query string.
 *
 * Every number in the body is clamped by `sanitise` before it reaches the
 * economy tick. The tick trusts its PlanetState — it is normally handed one
 * loaded from Postgres — so the clamping is what keeps a hostile body from
 * reaching it as `NaN` or `Infinity`.
 */
@Controller('public')
export class CalculatorController {
  private readonly model: PlanetModel = buildPlanetModel();

  /**
   * The canon item tables, so the page can render reference columns without
   * transcribing MANHOURS or MAXPL into the frontend. Compiled into the image
   * and immutable for the life of the process, exactly like the guide.
   */
  @Get('planet-model')
  @Header('Cache-Control', 'public, max-age=3600')
  getModel(): PlanetModel {
    return this.model;
  }

  /** One six-hour production tick, run through the live economy code. */
  @Post('calculator')
  @HttpCode(200)
  calculate(@Body() body: Partial<CalculatorInput>): CalculatorResult {
    return simulate(body ?? {});
  }
}

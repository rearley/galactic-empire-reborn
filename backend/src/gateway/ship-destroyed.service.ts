import { Inject, Injectable } from '@nestjs/common';
import type { CombatShipDestroyedPayload, EventLogCategory } from '@ge/wire';
import { CombatShipDestroyedEvent } from '../game/combat/combat-events';
import { PrismaService } from '../prisma/prisma.service';
import { ShipStateService } from '../game/ship/ship-state.service';
import { ScanHandlerService } from '../game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../game/physics/ship-class-cache.service';
import { RANDOM, Random, gernd } from '../game/combat/random.port';
import { attributePlanetKill } from '../game/combat/planet-kill';
import { isAiUserid } from '../game/commands/helpers/ai-userid';
import { formatMessage, MessageId } from '../game/commands/messages';
import { GESTAT_AUTO, DOC_PLANET_LIMIT, RNDDOC } from '../game/constants';
import { ITEM_NAMES } from '../game/constants/items';
import { handleOf, shipNameOf } from './ship-identity';

/**
 * What the death path needs of the transport layer, and nothing else.
 *
 * The service holds no `Server`: a ship dying is the most consequential event
 * in the game and it must be testable without Socket.io. Everything the
 * gateway still owns is reached through here —
 *
 *   • `recoverVictim` is `GameGateway.recoverAfterDeath`, which goes on to call
 *     `presentShipEntry`. That is connection-lifecycle code and stays on the
 *     gateway; this is the seam that reaches it.
 *   • `takeIonAttacker` reads and clears `GameGateway.lastIonAttacker`, which
 *     is written by `handlePlanetIonFired` — the other half of a colony kill,
 *     and also still gateway-resident.
 *   • `warn` / `error` go to the GATEWAY's logger, so the forensics line keeps
 *     coming out under the same context it always has.
 */
export interface DestroyedEmitter {
  /** One `event.log` line to a single room. */
  toRoom(room: string, category: EventLogCategory, text: string): void;
  /** One `event.log` line to the whole galaxy except the rooms named. */
  toAllExcept(rooms: string | string[], category: EventLogCategory, text: string): void;
  /** The structured `combat.ship-destroyed` announcement, galaxy-wide. */
  announceDestroyed(payload: CombatShipDestroyedPayload): void;
  /** The planet that last hit this ship, consumed. @see GameGateway.lastIonAttacker */
  takeIonAttacker(victimId: string): { name: string; at: number } | null;
  /** Re-seat the pilot who just died. @see GameGateway.recoverAfterDeath */
  recoverVictim(userid: string): Promise<void>;
  warn(message: string): void;
  error(message: string, err?: Error): void;
}

/**
 * Everything that happens when a ship dies, off the transport layer.
 *
 * This was `GameGateway.handleCombatShipDestroyed` — 256 lines holding a
 * `prisma.$transaction`, the clearest breach of the rule that the gateway
 * parses in, dispatches and serialises out. The gateway keeps the `@OnEvent`
 * decorator and hands this service an emitter.
 */
@Injectable()
export class ShipDestroyedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipStateService: ShipStateService,
    private readonly scanHandler: ScanHandlerService,
    private readonly shipClassCache: ShipClassCacheService,
    @Inject(RANDOM) private readonly random: Random,
  ) {}

  handle(event: CombatShipDestroyedEvent, emit: DestroyedEmitter): Promise<void> {
    const keyParts = event.victimShipKey.split(':');
    const victimShipno = Number(keyParts[keyParts.length - 1]);
    // Read before the hull leaves memory a few lines below — the KILLEDBY
    // announcement at the end of this handler needs it for an AI victim.
    const victimShipName = shipNameOf(this.shipStateService, event.victimShipKey) ?? null;
    // Same reason: canon's `username()` names a PLAYER by their handle
    // (GEFUNCS.C:2596), and ours lives on ShipState.username. Capture it before
    // the hull is evicted or the broadcast falls back to the account key —
    // which is what a pilot saw: "destroyed by usr_27523ed6401c4e990dd98be2!!!"
    const victimHandle = handleOf(this.shipStateService, event.victimShipKey);
    if (!isNaN(victimShipno)) {
      this.scanHandler.clearScantab(event.victimUserid, victimShipno);
    }

    // A destroyed player ship has its hull row deleted and noships decremented.
    // Without this line that happens in complete silence, which made two ships
    // lost during playtesting impossible to tell apart from a bug.
    //
    // It logs the whole MANIFEST because the hull row is about to be deleted
    // (canon's gepdb(GEDELETE)) and the ship-loss mail hardcodes `cash: 0n`
    // and `itemqty: []` — so without this, nothing anywhere records what the
    // pilot actually lost. A sysop asked to make someone whole after a bad
    // death could previously learn only that something of theirs died.
    //
    // WARN, not LOG: this is the line someone goes looking for months later,
    // and it must survive a log level that filters routine chatter.
    // @see docs/DECISIONS.md 2026-09-08 — ship-loss forensics
    emit.warn(this.shipLossManifest(event));

    // Delete the victim's hull row and decrement the fleet count atomically — but
    // ONLY for PLAYER ships. AI (status AUTO) hulls are managed by the AI layer
    // (Cybertron/Droid), never here:
    //   • Cybertron rows are PERSISTED and must LINGER after death so the
    //     respawn-slot upsert (createSpawn) can reuse the slot; hydrateAll skips
    //     rows with damage>=100. Deleting the row here would both remove the AI
    //     hull AND, being fire-and-forget, race the respawn upsert → orphan a
    //     freshly-respawned AI ship (in memory, no DB row).
    //   • Droids have no persisted hull row, so deleteMany would be a no-op anyway.
    // Determine player-vs-AI by the victim's status: prefer the in-memory status
    // (the combat emitter still holds the victim in memory at emit time); if the
    // ship was already evicted from memory, fall back to the DB row's status read
    // inside the transaction before deleting.
    // @see GEFUNCS.C:killem gepdb(GEDELETE) — dead PLAYER ships are deleted.
    // Guards (player path):
    //   • deleteMany (not delete) is a no-op when the row is already gone (race safety).
    //   • noships decrement is skipped when count=0 or when noships is already 0
    //     (underflow safety — mirrors C unsigned clamp behaviour).
    let hullWrite: Promise<unknown> = Promise.resolve();
    if (!isNaN(victimShipno)) {
      const inMemoryStatus = this.shipStateService.get(event.victimUserid, victimShipno)?.status;
      hullWrite = this.prisma.$transaction(async (tx) => {
        let status: number | undefined = inMemoryStatus;
        if (status === undefined) {
          const row = await tx.ship.findFirst({
            where: { userid: event.victimUserid, shipno: victimShipno },
            select: { status: true },
          });
          status = row?.status;
        }
        // AI hull — death/persistence owned by the AI layer; never delete or decrement.
        if (status === GESTAT_AUTO) return;

        const { count } = await tx.ship.deleteMany({
          where: { userid: event.victimUserid, shipno: victimShipno },
        });
        if (count > 0) {
          const user = await tx.user.findUnique({
            where: { userid: event.victimUserid },
            select: { noships: true },
          });
          if ((user?.noships ?? 0) > 0) {
            await tx.user.update({
              where: { userid: event.victimUserid },
              data: { noships: { decrement: 1 } },
            });
          }
        }
      }).catch((err: Error) => emit.error('death delete/decrement failed', err));
      this.shipStateService.removeFromGame({ userid: event.victimUserid, shipno: victimShipno });
    }

    // Name the killer when it was a planet. Without this the client saw no
    // attacker and no weapon — the same shape a self-destruct produces — and
    // announced the kill as "destroyed by unknown", so a defender was never
    // told their own colony had done it.
    const ionHit = emit.takeIonAttacker(event.victimId);
    const killedByPlanet = attributePlanetKill({
      hasAttackerShip: event.attackerId !== null,
      lastIonHitAt: ionHit?.at ?? null,
      now: Date.now(),
    });

    // Built field by field, NOT spread from the event.
    //
    // `CombatShipDestroyedEvent` is internal: it drives score transfer, loot,
    // the ship-loss mail and the forensics log. Spreading it into a galaxy-wide
    // emit published the kill's exact SECTOR (a live position feed on anyone
    // who fights), the internal account keys `displayName()` exists to hide —
    // `usr_...` and `Cybrg-NNN`, GEFUNCS.C:2596 username — the destroyed hull's
    // CARGO, and `victimDisconnectReason`, which was added so a SYSOP could
    // tell a closed tab from a dropped connection and is nobody else's
    // business. The client renders four fields; it now receives four.
    // @see docs/audits/2026-09-09-security-review.md
    // @see test/gateway/destroyed-payload-scoping.spec.ts
    const payload = {
      victimId: event.victimId,
      attackerId: event.attackerId,
      weapon: killedByPlanet ? ('ion' as const) : event.weapon,
      // Name the killer. A planet kill takes the planet's name; a ship kill
      // resolves the attacking ship's, because the client's own player list
      // holds live PLAYERS only — an AI killer is never in it, so a Cybertron
      // kill rendered as a bare id or nothing at all and two playtest pilots
      // died repeatedly with no combat text. The hit path already does this.
      attackerName: killedByPlanet
        ? (ionHit?.name ?? null)
        : (event.attackerName ?? (event.attackerId ? shipNameOf(this.shipStateService, event.attackerId) ?? null : null)),
    };
    emit.announceDestroyed(payload);

    // KILLEDBY — every pilot in the galaxy hears who killed whom.
    //
    //     prfmsg(KILLEDBY,username(ptr),username(wptr));
    //     outwar(FILTER,usrn,0);
    //
    // GEFUNCS.C:1116-1117, text at MBMGEMSG.MSG:2122. `outwar` is the
    // galaxy-wide send, and the prfmsg sits AFTER the `wptr->status ==
    // GESTAT_AUTO` branch at :1110 — so a Cybertron kill is announced exactly
    // like a player one. The port implemented none of it; a kill three sectors
    // away happened in silence, which is most of why the world read as empty.
    //
    // The labels are canon's `username()` (GEFUNCS.C:2596-2604): the SHIP name
    // for a CYBORG or DROID class, the userid for anyone else.
    //
    // Only a SHIP is announced. Canon's prfmsg lives inside
    // `if (who >= 0 && who < nships && who != usrn)` (GEFUNCS.C:1105), and
    // `fireion` sets the victim's lastfired to -1 (GEFUNCS.C:1797), so a
    // colony's ion cannons make a kill that nobody hears about. The killer's
    // name still travels on the structured payload for the sector to render.
    const hasKillerShip = event.attackerId !== null || event.attackerUserid !== null;
    const killerLabel = !hasKillerShip
      ? null
      : event.attackerUserid && !isAiUserid(event.attackerUserid)
        ? (handleOf(this.shipStateService, event.attackerShipKey) ?? event.attackerUserid)
        : payload.attackerName;
    if (killerLabel) {
      const victimLabel = isAiUserid(event.victimUserid)
        ? (victimShipName ?? event.victimUserid)
        : (victimHandle ?? event.victimUserid);
      // Everyone EXCEPT the pilot who just died, and except anyone who asked
      // not to hear it. Canon is `outwar(FILTER, usrn, 0)` (GEFUNCS.C:1117),
      // and both halves of that call matter:
      //
      //   • `usrn` is the victim's own channel and outwar's loop is
      //     `if (zothusn != exclude && ingegame(zothusn))` (GEMAIN.C:1524) —
      //     the dying pilot is deliberately skipped. They get YOURDEAD
      //     instead, which is a better message and arrives a few lines below.
      //   • FILTER is not decoration. outwar hands it to `outprfge`, which
      //     drops the message for any recipient with `options[MSG_FILTER]`
      //     set: `if (class == FILTER && (warusroff(shpno)->options[MSG_FILTER]
      //     == TRUE)) { clrprf(); return; }` (GEMAIN.C:2562-2567). Compare
      //     ALWAYS at GEMAIN.C:2557-2561, which bypasses the check — that is
      //     the class YOURDEAD and CHGLSR are sent with.
      //
      // The port read User.options[3] into ShipState.msgFilter (GEMAIN.H:236)
      // and then broadcast to everyone regardless, so the one option a pilot
      // has for quieting the galaxy feed did nothing on the noisiest message
      // in the game.
      //
      // Only ships in the map are considered, which is also canon's
      // `ingegame(zothusn)` gate — a user with no ship in the universe is not
      // a recipient at all.
      const filteredRooms = this.shipStateService
        .findAllShips()
        .filter((s) => s.msgFilter)
        .map((s) => `user:${s.userid}`);
      emit.toAllExcept(
        [`user:${event.victimUserid}`, ...new Set(filteredRooms)],
        'combat',
        formatMessage(MessageId.KILLEDBY, victimLabel, killerLabel),
      );
    } else {
      // DIED — the same announcement for a death no ship caused.
      //
      //     prfmsg(DIED,ptr->shipname,username(ptr));
      //     outwar(ALWAYS,usrn,0);
      //
      // GEFUNCS.C:1262-1264, the `else` of the who-fired guard at :1104. A
      // killer-less death is NOT silent in canon, which is what the port
      // assumed: this covers a self-destruct, a gravity crash, and a colony's
      // ion cannons, since `fireion` sets the victim's lastfired to -1
      // (GEFUNCS.C:1797) and so takes this branch every time.
      //
      // Two differences from KILLEDBY, both canon's:
      //   • the class is ALWAYS, not FILTER, so it reaches pilots who have
      //     muted the galaxy feed (GEMAIN.C:2557-2561). Only the victim is
      //     excluded, by outwar's own `usrn` argument.
      //   • the subject is the SHIP name followed by `username()`, so an
      //     automaton reads as "The X, Commanded by X" — canon's own output,
      //     because username() returns the shipname for a CYBORG or DROID.
      //
      // The React client used to paper over this gap with a line of its own
      // whose fallback printed the raw `Cybrg-NNN` userid — the internal
      // account name username() exists to hide. @see GEFUNCS.C:2596-2604
      const victimLabel = isAiUserid(event.victimUserid)
        ? (victimShipName ?? event.victimUserid)
        : (victimHandle ?? event.victimUserid);
      emit.toAllExcept(
        `user:${event.victimUserid}`,
        'combat',
        formatMessage(MessageId.DIED, victimShipName ?? victimLabel, victimLabel),
      );
    }

    // The victor may capture the victim's colony list — one kill in six.
    // Canon does this inside killem, after the kill is attributed and before
    // the class kill_func (GEFUNCS.C:1227-1251). Fire-and-forget: a failed
    // lookup must not take the rest of the kill handling down with it.
    if (event.attackerUserid && !isAiUserid(event.attackerUserid)) {
      void this.revealCapturedDocument(event.victimUserid, event.attackerUserid, emit)
        .catch((err: unknown) => {
          const stack = err instanceof Error ? err.stack : String(err);
          emit.error(`Captured-document reveal failed: ${stack}`);
        });
    }

    // Tell the pilot who just died that they SURVIVED. C prints YOURDEAD to
    // the victim before killem (GEFUNCS.C:978-987), with outprfge(ALWAYS,usrn)
    // so it bypasses the message filter — this is not flavour, it is the one
    // message that tells a player they escaped, that a Galactic Command
    // freighter picked them up, and that they are back at Zygor with a
    // replacement waiting. The port printed a bare destruction notice, so
    // losing a hull read as the end of the run rather than a setback.
    // @see MBMGEMSG.MSG:2099-2111
    emit.toRoom(`user:${event.victimUserid}`, 'combat', formatMessage(MessageId.YOURDEAD));

    // ...and put them somewhere they can play again. The hull row is gone but
    // the socket still holds its shipno, so every subsequent command —
    // `rep`, `mai`, even `hel` — short-circuited to "No active ship." until
    // the player reconnected.
    //
    // Canon does not leave the session in limbo: checkdam prints YOURDEAD,
    // calls killem, then resets `user[usrn].substt = 0` (GEFUNCS.C:999-1004),
    // returning the captain to a state they can act from — which is the whole
    // point of YOURDEAD telling them a freighter dropped them at Zygor.
    //
    // presentShipEntry is the same recovery `abandon` already uses, and its
    // own docstring records why it exists: "without it an abandoned captain sat
    // at a session that answered 'No active ship.' to everything." Death is
    // the same situation and never called it.
    void emit.recoverVictim(event.victimUserid);

    // Everything above is synchronous; only the hull write is outstanding.
    return hullWrite.then(() => undefined);
  }

  /**
   * One greppable line describing everything a destroyed hull was carrying.
   *
   * Must be called BEFORE the hull leaves the in-memory map, and must never
   * throw: it runs inside the destruction handler, and losing the kill because
   * the forensics failed would be far worse than losing the forensics.
   */
  private shipLossManifest(event: CombatShipDestroyedEvent): string {
    const parts: string[] = [
      'ship destroyed:',
      `victim=${event.victimShipKey}`,
      `attacker=${event.attackerShipKey ?? 'none'}`,
      `cause=${event.weapon ?? 'unknown'}`,
      `sector=(${event.sector.x},${event.sector.y})`,
    ];

    // Only present when the death came from the disconnect path. It is the one
    // fact that separates "closed the tab" from "their network dropped", and
    // the kill treats both identically.
    if (event.victimDisconnectReason) {
      parts.push(`disconnectReason='${event.victimDisconnectReason}'`);
    }

    try {
      const keyParts = event.victimShipKey.split(':');
      const shipno = Number(keyParts[keyParts.length - 1]);
      const ship = Number.isFinite(shipno)
        ? this.shipStateService.get(keyParts.slice(0, -1).join(':'), shipno)
        : undefined;

      if (ship) {
        let className: string | undefined;
        try {
          className = this.shipClassCache.getTypeName(ship.shpclass);
        } catch {
          /* cache miss — the class NUMBER is the part that matters for restoring */
        }
        parts.push(
          `name='${ship.shipname}'`,
          `class=${ship.shpclass}${className ? `(${className})` : ''}`,
          // The fittings are the expensive half of a loss: a Mark-6 phaser is
          // ~253,000 credits of trade-ins, and nothing else records them.
          `phaser=${ship.phasrtype}`,
          `shield=${ship.shieldtype}`,
        );

        const cargo = (ship.items ?? [])
          .map((qty, i) => ({ name: ITEM_NAMES[i] ?? `item${i}`, qty }))
          .filter((e) => (e.qty ?? 0n) > 0n)
          .map((e) => `${e.name}=${e.qty}`);
        parts.push(`cargo=[${cargo.join(' ')}]`);
      } else {
        // A race, or an AI victim with no ShipState. Keep the identity line
        // rather than dropping the record entirely.
        parts.push('manifest=unavailable(hull-not-in-memory)');
      }
    } catch (err: unknown) {
      parts.push(`manifest=unavailable(${err instanceof Error ? err.message : String(err)})`);
    }

    return parts.join(' ');
  }

  /**
   * One kill in six yields the victim's colony list to the victor.
   *
   *   if (gernd()%RNDDOC == 0) {
   *       if (qeqbtv(ptr->userid,1)) {
   *           prfmsg(CAPTDOC);
   *           do { ...if (sameas(planet.userid,ptr->userid))
   *                    prf("%-20s %d %d   %d \r",name,xsect,ysect,plnum);
   *                  outprfge(ALWAYS,who); ... } while (qnxbtv() && (++i < 20));
   *       }
   *   }
   *
   * @see GEFUNCS.C:1227-1251 (inside killem), GEMAIN.H:192-193 SHOWDOC/RNDDOC
   *
   * `ptr` is the VICTIM, so what is captured is a list of THEIR planets, handed
   * to `who` — the killer. It is real intelligence: where to raid next. SHOWDOC
   * is `#define SHOWDOC 1`, so this is compiled in, not an optional extra.
   *
   * The 20 is canon's cap on the listing, and the roll is taken BEFORE the
   * lookup so an unlucky kill costs no query.
   */
  // Public, not private: `GameGateway` keeps a one-line delegate because
  // `test/gateway/captured-document.spec.ts` drives that entry point directly.
  async revealCapturedDocument(
    victimUserid: string,
    killerUserid: string,
    emit: DestroyedEmitter,
  ): Promise<void> {
    if (!killerUserid) return;
    if (gernd(this.random) % RNDDOC !== 0) return;

    const planets = await this.prisma.planet.findMany({
      where: { userid: victimUserid },
      select: { name: true, xsect: true, ysect: true, plnum: true },
      take: DOC_PLANET_LIMIT,
    });
    if (planets.length === 0) return;

    const room = `user:${killerUserid}`;
    emit.toRoom(room, 'combat', formatMessage(MessageId.CAPTURED_DOC));
    for (const p of planets) {
      emit.toRoom(room, 'combat', `${p.name.padEnd(20)} ${p.xsect} ${p.ysect}   ${p.plnum}`);
    }
  }
}

import { Injectable } from '@nestjs/common';

/**
 * Who is connected right now, for the public stats page.
 *
 * Deliberately not derived from either obvious source. ShipChannelRegistry
 * holds AI ships as well as players. Counting raw sockets double-counts a
 * reconnect and a second browser tab. This tracks distinct userids and nothing
 * else.
 *
 * In-memory and process-local, consistent with the project's no-Redis rule: on
 * restart it is empty and refills as players reconnect.
 */
@Injectable()
export class PresenceService {
  private readonly online = new Set<string>();

  arrive(userid: string): void { this.online.add(userid); }

  /** Safe for a userid never seen — the guard rejects sockets before arrival. */
  depart(userid: string): void { this.online.delete(userid); }

  count(): number { return this.online.size; }

  has(userid: string): boolean { return this.online.has(userid); }
}

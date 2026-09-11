import { PrismaClient } from './client';

/**
 * The client Prisma hands an interactive transaction callback.
 *
 * It is the full client minus the methods that make no sense inside a
 * transaction, which is how Prisma types the callback parameter. Repository
 * methods that must compose inside a caller's transaction take one of these as
 * an optional last argument and fall back to the injected service.
 *
 * This lives here, and not beside one consumer, because a second local copy is
 * how team creation ended up passing no client at all: the callback took no
 * parameter, so both writes ran on the outer client and the transaction bought
 * nothing. @see issue #14
 */
export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

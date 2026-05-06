export const BCRYPT_COST = 12;

export const JWT_EXPIRES_IN = '30d';

/**
 * Pre-computed bcrypt hash used for constant-time dummy comparisons during
 * login to prevent user enumeration via timing attacks.
 * Hash of 'dummy-password' at cost factor 12.
 */
export const DUMMY_BCRYPT_HASH =
  '$2b$12$GhvMmNVjRW29ulnudl.LbuAnUtN/LRfe1JsBm1Vbpdb/07MNbN.GC';

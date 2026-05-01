// Pinned GEMAIN.H constants.
// These are used by array-length assertions in the test suite.
// A deliberate change to any of these values MUST break balance-constants.spec.ts.
// @see reference/ge-source/GEMAIN.H

export const UIDSIZ = 30 as const; // GEMAIN.H:~120 (MajorBBS system constant)
export const MAXTORPS = 3 as const; // GEMAIN.H:125
export const MAXMISSL = 3 as const; // GEMAIN.H:126
export const MAXDECOY = 10 as const; // GEMAIN.H:127
export const NUMITEMS = 14 as const; // GEMAIN.H:141
export const MAXX = 30 as const; // GEMAIN.H:121
export const MAXY = 15 as const; // GEMAIN.H:122
export const MAXTEAMS = 50 as const; // GEMAIN.H:240
export const BEACONMSGSZ = 75 as const; // GEMAIN.H:242

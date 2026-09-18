/**
 * One report as it is filed. Mirrors the `BugReport` model minus its defaults.
 *
 * The id is minted by the CALLER, not by the database: a command handler is
 * synchronous and cannot await the insert, and a player who is told nothing has
 * no way to refer to the thing they just filed.
 */
export interface NewBugReport {
  id: string;
  userid: string;
  username: string | null;
  text: string;
  shipno: number | null;
  shipname: string | null;
  shpclass: number | null;
  xcoord: number | null;
  ycoord: number | null;
  damage: number | null;
  /** The build it happened ON. @see src/public/build-version.ts */
  version: string;
  sha: string;
}

export interface BugReportRow extends NewBugReport {
  createdAt: Date;
  status: string;
}

export const REPORT_OPEN = 'open';
export const REPORT_CLOSED = 'closed';

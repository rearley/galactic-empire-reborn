/**
 * Balance-regression constants — Constitution Principle II
 * These tests pin the GEMAIN.H constants used by the schema.
 * A deliberate constant change MUST break this file.
 * @see reference/ge-source/GEMAIN.H
 */
import {
  UIDSIZ,
  MAXTORPS,
  MAXMISSL,
  MAXDECOY,
  NUMITEMS,
  MAXX,
  MAXY,
  MAXTEAMS,
  BEACONMSGSZ,
} from "./helpers/constants";

describe("GEMAIN.H balance constants (regression)", () => {
  it("UIDSIZ = 30", () => expect(UIDSIZ).toBe(30));
  it("MAXTORPS = 3", () => expect(MAXTORPS).toBe(3));
  it("MAXMISSL = 3", () => expect(MAXMISSL).toBe(3));
  it("MAXDECOY = 10", () => expect(MAXDECOY).toBe(10));
  it("NUMITEMS = 14", () => expect(NUMITEMS).toBe(14));
  it("MAXX = 30", () => expect(MAXX).toBe(30));
  it("MAXY = 15", () => expect(MAXY).toBe(15));
  it("MAXTEAMS = 50", () => expect(MAXTEAMS).toBe(50));
  it("BEACONMSGSZ = 75", () => expect(BEACONMSGSZ).toBe(75));
  it("sector grid = MAXX * MAXY = 450", () => expect(MAXX * MAXY).toBe(450));
});

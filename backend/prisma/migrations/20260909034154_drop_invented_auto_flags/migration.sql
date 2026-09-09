-- `set auto-shield` and `set auto-repair` were port inventions with no canon
-- equivalent: cmd_set has `#define NUMOPTS 4` (scannames, scanhome, scanfull,
-- filter) and nothing else. auto-shield additionally reversed a rule canon
-- states in capitals in its own help — "They WILL NOT be automatically raised
-- after the firing" (MBMGEHLP.MSG HLPSHI) — and auto-repair silently ran
-- maintenance, charging the pilot cash with no price quoted.
--
-- Both commands are gone, so the flags they toggled go with them. Dropping
-- boolean preference columns loses nothing a player can miss: the feature they
-- controlled no longer exists.
ALTER TABLE "Ship" DROP COLUMN "autoShield";
ALTER TABLE "Ship" DROP COLUMN "autoRepair";

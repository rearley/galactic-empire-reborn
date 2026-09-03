/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with:  node tools/extract-ai-taunts.mjs
 * Pinned by:        backend/test/balance/ai-taunt-canon.balance.spec.ts
 *
 * Droid annoyance messages, release 3.2e.
 * Source: reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG (DRDMSG*, DRDHLP*).
 *
 * Unlike cyb_annoy, droid_annoy is handed literal message ids, so these are
 * keyed by mnemonic and sliced by the call sites in GEDROIDS.C.
 *
 * The %s is the droid's ship name: prfmsg(..., ptr->shipname).
 *
 * @see GEDROIDS.C:232-245 droid_annoy
 */

export const DRD_ANNOY: Readonly<Record<string, string>> = {
  DRDMSG1: "***\nBeacon Message from The %s\n< This Survey Ship is protected under Galactic Treaty Gt05-66A6-5532 >",
  DRDMSG2: "***\nBeacon Message from The %s\n< Disturbing this Survey Ship is punishable under Galactic Law >",
  DRDMSG3: "***\nBeacon Message from The %s\n< Maintain standard approach clearance regulations Gr06-25K5-29D2 >",
  DRDMSG4: "***\nBeacon Message from The %s\n< Caution! Auto Defense Systems Activated >",
  DRDMSG5: "***\nBeacon Message from The %s\n< Warning! This Vessel equiped with Auto Defense Systems! >",
  DRDMSG6: "***\nBeacon Message from The %s\n< CAUTION! This Vessel Transports Hazardous Material >",
  DRDMSG7: "***\nBeacon Message from The %s\n< This Vessel is protected under Galactic Treaty Gt05-66A6-5532 >",
  DRDMSG8: "***\nBeacon Message from The %s\n< Disturbing this Vessel is punishable under Galactic Law >",
  DRDMSG9: "***\nBeacon Message from The %s\n< Maintain standard approach clearance regulations Gr06-25K5-29D2 >",
  DRDMSG10: "***\nBeacon Message from The %s\n< CAUTION! Avoid contamination! Maintain Clearance >",
  DRDMSG11: "***\nHailing Message from The %s\n< Warning! This Ship is tranporting goods under Murdonian Imperial Authority >",
  DRDMSG12: "***\nHailing Message from The %s\n< Warning! Interfering with this vessel in punishable by Murdonian Law >",
  DRDMSG13: "***\nHailing Message from The %s\n< Warning! Approaching this vessel will be considered an act of agression >",
  DRDMSG14: "***\nHailing Message from The %s\n< Warning! This vessel tranporting goods under Galactic Treaty >",
  DRDMSG15: "***\nHailing Message from The %s\n< Warning! Maintain clearance from this vessel >",
  DRDHLP1: "***\nHailing Message from The %s\n< Your Actions are in violation of Galactic Treaty! Cease and Desist! >",
  DRDHLP2: "***\nHailing Message from The %s\n< Auto Defense systems activated. Cease and Desist this attack! >",
  DRDHLP3: "***\nDistress Call from The %s\n< This vessel under an illegal attack. Request assistance! >",
  DRDHLP4: "***\nDistress call from The %s\n< Under attack. Requesting assistance from any Vessel.>",
  DRDHLP5: "***\nHailing Message from The %s\n< The Vakory High Command has been informed of you illegal agression >",
  DRDHLP11: "***\nHailing Message from The %s\n< Your Actions will be reported to the Murdonian Imperial Defense Command >",
  DRDHLP12: "***\nHailing Message from The %s\n< This is a peacefull transport ship. Your actions are reprehensable!",
  DRDHLP13: "***\nDistress Call from The %s\n< This vessel under an illegal aggression. Request assistance! >",
  DRDHLP14: "***\nDistress call from The %s\n< Under attack. Requesting assistance from any Vessel.>",
  DRDHLP15: "***\nHailing Message from The %s\n< The Murdonian Imperial Defense has been informed of you illegal agression >",
};

# MBMGEMSG.MSG — sysop configurable options

The following are values that can be configured by the sysop in the MBMGEMSG.MSG file:

## BBS settings
PLAYKEY = what type of BBS user you need to be Galactic Empire

REGNO = your registration number, required in order for Galactic Empire to function on your system.

GEMNU = the name of the game on the BBS menu (by default, "Galactic Empire"). This value was used in version 5 of MajorBBS and has no effect in version 6.

GESEL = the selection letter on the BBS menu (by default, G). Only used on MajorBBS 5.

FREEBIES = 1 to allow non-paying users to play, 0 for no. Only used on MajorBBS 5.

PROFON = profanity filter, yes or no

SHOWOPT = debug level, 0 to 3

LOGFLG = output log to file, yes or no

USEGEMSG = use in-game mail system (yes) or send to user's BBS mailbox (no), default yes

## Sysop
SYSKEY = what type of BBS user you need to be in order to use the SYS command.

SYSCMDS = allow SYS command, default yes

SYSONLY = only allow sysop to use SYS command, default yes (no means ANYONE can)

## Files
GEUSER = user database, default MBMGEUSR.DAT

GESHIP = ship database, default MBMGESHP.DAT

GEMAIL = mail database, default MBMGEMAL.DAT

GEPLNT = planet database, default MBMGEPLT.DAT

GESHIPCL = runtime ship database, default MBMGESHP.MCV

## Optional main menu selection
The "Whats New!" option of the main menu of Galactic Empire can be configured by the sysop to show something else. It can be turned off completely, or changed to have a different description and selection letter. When selected, it will display the contents of MBMGEMNU.TXT.

OPTMENU = YES to show the option for the "Whats new!" on the main Galactic Empire menu, NO to turn it off.

OPTTXT = The name of the optional menu entry (by default, "Whats New!")

OPTCHR = The selection character of the optional menu entry (by default, N).

## Players
MAXPLRS = max players allowed in the game at once, default 30

MAXLIST = max top players shown on the roster, default 10

MAXSHIPS = max ships a player can own, default 8

MAXPLNTS = max planets a player can own, default 20

MAILDAYS = how many days to save mail, 1 to 7, default 3

STRTCASH = starting cash amount in 1000s, 1 to 32000, default 100 (100,000 Cs)

## Sectors and planets
MAXPLSE = max planets that can appear in a sector, default 5

SE100DAM = amount of damage done when attempting to fire in neutral zone, default 10, instant kill 101

TRANSOPT = allow users to transfer items to planets they don't own, default yes

PLANTOCK = how often to update planets, in minutes, default 360 (every six hours)

PLODDS = how likely a sector will have planets, 1 (most likely) to 20 (least likely), default 3 (TO DO: what was changed in release 3.1c)

WORMODDS = how likely a sector will have wormholes, 1 (least likely) to 100 (most likely), default 6

## CPU ships
NUMSHIPS = number of CPU ships in the game, default 30 (TO DO: it says up to 256, but the listed range is 0 to 500, so investigate)

MAXDROID = maximum amount of DROID (non-combatant) CPU ships, default 6

TOOCLOSE = how close (in parsecs) a non-combative (that is, a ship with SXXCATK set to no in MBMGESHP.MSG) can get to a combative CPU ship before it attacks, 1 to 32000, default 2500 (actual value is random and between this value and twice this value)

CYBGOLD = maximum amount of gold held by combative CPU ships, 0 to 32000, default 1200

HYPDST1 = if combative CPU ships are more than this value of sectors away from player target use hyperwarp, 1 to 32000, default 25, must be larger than HYPDST2, new in 3.2c7

HYPDST2 = if combative CPU ships are closer than this value of sectors away from player target use hyerwarp, 1 to 32000, default 10, must be smaller than HYPDST1, new in 3.2c7

## Galaxy
UNIVMAX = radius of galaxy, 10 to 32000, default 300 (galaxy extends to sector 300 300 and -300 -300)

UNIVWRAP = does galaxy wrap around, yes or no, added in version 3.2c.5

MAXPLREC = maximum size of planet database in Kb, 10 to 32767, default 32767

## Weapons
TORFACT = range of torpedo lockon (TO DO: figure out and explain how this works)

TDAMMAX = maximum damage % a torpedo can do, default 35 (TO DO)

TORPSPED = speed of torpedo (parsecs traveled per centock), 1 to 10000, default 2441

MISFACT = range of missle lockon (TO DO)

MDAMMAX = maximum damage % a missile can do, default 25 (TO DO)

MISLSPED = speed of missile (parsecs traveled per centock), 1 to 10000, default 1212

MISENGFC = ratio of flux pile power withdrawn to charge of missle, 1 to 2000, default 10 (e.g. MIS X 50000 withdraws 5000 from flux)

NUMMINES = maximum number of mines allowed at once, default 12

USRMINES = maximum number of mines per user allowed at once, default 3

MNDAMMAX = maximum damage % from a mine, default 75

DECODDS = odds in % of a decoy catching a missile or torpedo, default 11

HPFIRDST = hyperphaser distance factor, 1 (longest) to 20 (shortest), default 5

HPDAMMAX = maximum damage % of hyperphaser, 1 to 200, default 50

PFIRDST = phaser distance factor, 1 (longest) to 20 (shortest), default 5

PDAMMAX = maximum damage % of phaser, 1 to 200, default 50

PHATOWRP = minimum class of (non-hyper) phaser required to hit a ship traveling at warp, default 3

## Other ship functions
REPAIRRT = rate of spontaneous ship repair in %, default 6

JAMTIME = length of jammer, 1 to 10, default 3 (TO DO: explain how this works)

CLENGUSE = amount of flux used per centock by cloak, 1 to 32000, default 7500

## Scoring
SCRBONUS = maximum bonus for killing top scoring players, 1 to 32700, default 1000 (1000 points for killing top player, 500 for player 2, 333 for player 3, etc), new in 3.1c

SCRFACT = when bonus is awarded, percentage of points to deduct from killed player, default 35 (loser would lose 350 points if winner gets 1000), new in 3.1c

CHGLOSER = % that a killed player loses of their cash which is awarded to the winner, default 2

TEAMBONU = bonus points (x100) added to team score for each player in a team, 0 to 32000, default 5 (500)

TEAMMAX = max members on a team, 0 to 32000, default 10

## Neutral zone planets
S00PLNUM = number of planets in neutral zone, 3 to 9, default 6

Below are the options for planet 1 in the neutral zone, called Zygor by default. Other planets in the neutral zone can be defined by changing the other S00P<u>X</u> values, for example S00P2 for the second planet. The neutral zone must have at least three planets, one of which must be type 1 (Zygor/trading planet), one of which must be type 2 (Tahanian Station/population planet), and one of which must be type 0 (Enforcer Planet). Other planets and wormholes can be defined, up to the maximum of nine in a sector. You may have more planets in the neutral zone than the value of MAXPLSE. If you change a planet's owner to the name of a player in the game, this player will be able to administer the planet.

If you change the name of Zygor and/or Tahanian Station, you may want to search through MBMGEMSG.MSG and MBMGEHLP.MSG to change all references to those planets to their new names, as the game will not do so automatically.

S00P1DEF = is there a planet 1, default yes

S00P1NM = planet 1 name, default Zygor

S00P1OWN = planet 1 owner, default *EMPIRE*

S00P1TYP = planet 1 type (0 normal, 1 Zygor, 2 Tahanian Station, 3 wormhole)

S00P1X = X coordinate of planet 1, default 5000

S00P1Y = Y coordinate of planet 1, default 5000

S00P1ENV = planet 1 environment (0 poor, 1 marginal, 2 good, 3 very good), default 3

S00P1RES = planet 1 resources (0 poor, 1 marginal, 2 good, 3 very good), default 3

The remaining planets (up to the amount of S00PLNUM) needed to be configured as well, by editing the values beginning with S00P2, S00P3, and so on.

## Maximum amount of items on a planet
The maximum amount of a particular item that can be maintained on a marginal/marginal planet without a planetary cash bonus. The range for all options is 0 to 2147483647.

ITMPL01 = maximum men on a planet, default 201228378

ITMPL02 = maximum missiles on a planet, default 39633

ITMPL03 = maximum torpedoes on a planet, default 59833

ITMPL04 = maximum ion cannons on a planet, default 250

ITMPL05 = maximum flux pods on a planet, default 923

ITMPL06 = maximum food cases on a planet, default 187312837

ITMPL07 = maximum fighters on a planet, default 579332

ITMPL08 = maximum decoys on a planet, default 5399

ITMPL09 = maximum troops on a planet, default 201228378

ITMPL10 = maximum zippers on a planet, default 5233

ITMPL11 = maximum jammers on a planet, default 25928

ITMPL12 = maximum mines on a planet, default 25867

ITMPL13 = maximum gold on a planet, default 10000

ITMPL14 = maximum spys on a planet, default 5

(ITMPL15 through ITMPL25 are defined and marked as "reserved for expansion")

## Item weight
The weight of 100 units of a particular item. The range for all options is 0 to 2147483647.

ITMWT01 = weight of 100 men, default 100

ITMWT02 = weight of 100 missiles, default 500

ITMWT03 = weight of 100 torpedoes, default 300

ITMWT04 = weight of 100 ion cannons, default 25000

ITMWT05 = weight of 100 flux pods, default 2000

ITMWT06 = weight of 100 food cases, default 200

IMTWT07 = weight of 100 fighters, default 1500

IMTWT08 = weight of 100 decoys, default 300

ITMWT09 = weight of 100 troops, default 200

ITMWT10 = weight of 100 zippers, default 500

ITMWT11 = weight of 100 jammers, default 400

ITMWT12 = weight of 100 mines, default 500

ITMWT13 = weight of 100 gold, default 50

ITMWT14 = weight of 100 spy, default 100

(ITMWT15 through 25 are defined and and marked as "reserved for expansion")

## Point value of items
How many points a player is given for keeping these items on a planet they own. This value is divided by PLTVDIV to determine the actual points awarded. By default, a player is only awarded points for keeping men on a planet, all other items are set to 0. The range is 0 to 201288837.

ITMWT01 = point value of men, default 10

(ITMWT02 through 14 default to 0, ITMWT15 through 25 are defined and unused)

## Planet item production rate
How many units of an item that 10,000 men will create in 42 planetary cycles (about a week and half with default settings). This is affected by tax rate, planet quality, and work assignments. For example, the default value of ITMMH03 is 500. This means that a population of 10000 men would create 11 torpedoes (11.9047... rounded down) per planetary cycle given a zero % tax rate, marginal environment and resources, no planetary cash bonus, and 100% of work assignments assigned to men. The range is 0 to 201288837.

ITMMH01 = production rate of men, default 3500

ITMMH02 = production rate of missiles, default 300

ITMMH03 = production rate of torpedoes, default 500

ITMMH04 = production rate of ion cannons, default 4

ITMMH05 = production rate of flux pods, default 200

ITMMH06 = production rate of food cases, default 8000

ITMMH07 = production rate of fighters, default 100

ITMMH08 = production rate of decoys, default 900

ITMMH09 = production rate of troops, default 200

ITMMH10 = production rate of zippers, default 100

ITMMH11 = production rate of jammers, default 300

ITMMH12 = production rate of mines, default 500

ITMMH13 = production rate of gold, default 30

ITMMH14 = production rate of spys, default 20

(ITMMH15 through 25 are defined and marked as reserved)

## Base prices
(TO DO: explain how base prices work), range is 1 to 3200

ITMPR01 = base price of men, default 2

ITMPR02 = base price of missiles, default 20

ITMPR03 = base price of torpedoes, default 7

ITMPR04 = base price of ion cannons, default 33

ITMPR05 = base price of flux pods, default 200

ITMPR06 = base price of food cases, default 2

ITMPR07 = base price of fighters, default 50

ITMPR08 = base price of decoys, default 18

ITMPR09 = base price of troops, default 1

ITMPR10 = base price of zippers, default 99

ITMPR11 = base price of mines, default 21

ITMPR12 = base price of jammers, default 16

ITMPR13 = base price of gold, default 1000

ITMPR14 = base price of spys, default 100

(ITMPR15 through 25 are defined and reserved)

## Shield prices
The price of upgrading your shields at Zygor. You are given a 2/3rd credit for your existing shields when changing. Range is from 1 to 201288837. Changing these values does not change what is displayed by entering HELP NEWPRICE, so make sure to update MBMGEHLP.MSG to match.

SHLDPR01 = price for Mark-1 shields, default 5000

SHLDPR02 = price for Mark-2 shields, default 10000

SHLDPR03 = price for Mark-3 shields, default 40000

SHLDPR04 = price for Mark-4 shields, default 100000

SHLDPR05 = price for Mark-5 shields, default 250000

SHLDPR06 = price for Mark-6 shields, default 500000

SHLDPR07 = price for Mark-7 shields, default 750000

SHLDPR08 = price for Mark-8 shields, default 1100000

SHLDPR09 = price for Mark-9 shields, default 1500000

SHLDPR10 = price for Mark-10 shields, default 2500000

SHLDPR11 = price for Mark-11 shields, default 4000000

SHLDPR12 = price for Mark-12 shields, default 6000000

SHLDPR13 = price for Mark-13 shields, default 8000000

SHLDPR14 = price for Mark-14 shields, default 10000000

SHLDPR15 = price for Mark-15 shields, default 30000000

SHLDPR16 = price for Mark-16 shields, default 50000000

SHLDPR17 = price for Mark-17 shields, default 80000000

SHLDPR18 = price for Mark-18 shields, default 120000000

SHLDPR19 = price for Mark-19 shields, default 200000000

## Phaser prices
The price of upgrading your phaser at Zygor. You are given a 2/3rd credit for your existing phaser when changing. Range is from 1 to 201288837. Changing these values does not change what is displayed by entering HELP NEWPRICE, so make sure to update MBMGEHLP.MSG to match.

PHSRPR01 = price for Mark-1 shields, default 5000

PHSRPR02 = price for Mark-2 shields, default 10000

PHSRPR03 = price for Mark-3 shields, default 40000

PHSRPR04 = price for Mark-4 shields, default 100000

PHSRPR05 = price for Mark-5 shields, default 220000

PHSRPR06 = price for Mark-6 shields, default 400000

PHSRPR07 = price for Mark-7 shields, default 650000

PHSRPR08 = price for Mark-8 shields, default 900000

PHSRPR09 = price for Mark-9 shields, default 1200000

PHSRPR10 = price for Mark-10 shields, default 2000000

PHSRPR11 = price for Mark-11 shields, default 3800000

PHSRPR12 = price for Mark-12 shields, default 5000000

PHSRPR13 = price for Mark-13 shields, default 7000000

PHSRPR14 = price for Mark-14 shields, default 9000000

PHSRPR15 = price for Mark-15 shields, default 15000000

PHSRPR16 = price for Mark-16 shields, default 30000000

PHSRPR17 = price for Mark-17 shields, default 60000000

PHSRPR18 = price for Mark-18 shields, default 100000000

PHSRPR19 = price for Mark-19 shields, default 200000000

## Planet points divisor
PLTVDIV = (TO DO explain how this works)

PLTVCASH = each 1m of cash on a planet (both bank and taxes) is worth this many points, range 1 to 201288837, default 10

## Planetary attack
IDAMMAX = maximum damage % from ion cannon per shot, default 50

PLATTRF1 = Efficiency of defending troops taking out attacking fighters, default 18. There is a 60% chance that a planet with more than 500 troops will take out some fighters before the fighter-on-fighter combat begins.<ref>GECMDS.C, line 3834-3839</ref> When this occurs, a random value between 0.05 and 0.05 plus this value divided by 100 is generated (using the default, between 0.05 and 0.23). This random value is multiplied by the amount of attacking fighters to determine the amount of attacking fighters to eliminate.

PLATTRF2 = Efficiency of defending fighters taking out attacking fighters, default 100. For each attack, a random value between 0.20 and 0.20 plus this value divided by 100 is generated (using the default, between 0.20 and 1.20). This random value is multiplied by the amount of defending fighters to determine the amount of attacking fighters to eliminate. If this amount is equal to or more than the amount of attacking fighters, all fighters are lost.

PLATTRF3 = Efficiency of attacking fighters taking out defending fighters, default 55. For each attack, a random value between 0.20 and 0.20 plus this value divided by 100 is generated (using the default, between 0.20 and 0.75).

PLATTRT1 = Efficiency of defending troops taking out attacking troops, default value 125. For each attack, a random value between 0.25 and 0.25 plus this value divided by 100 is generated (using the default, between 0.25 and 1.5). This random value is multiplied by the amount of defending troops to determine the amount of attacking troops to eliminate. If this amount is equal to or more than the amount of attacking troops, all attacking troops are lost.

PLATTRT2 = Efficiency of attacking troops taking out defending troops, default value 35. For each attack, a random value between 0.1 and and 0.1 plus this value divided by 100 is generated (using the default, between 0.1 and 0.45). This random value is multiplied by the amount of attacking troops to determine the amount of defending troops to eliminate. If this amount is equal to or more than the amount of defending troops, all defending troops are lost.

(The rest of the file is the text of menus, messages from the helm, hailing messages from CPU ships, and more, all of which can be edited.)

## Unused messages
Several messages exist in MBMGEMSG.MSG that either were used in previous versions of Galactic Empire but unused in 3.2e, or were being considered for future versions but never implemented. These include:

- "Enter warp factor (0 - 100)"
- "Sorry Sir, we cannot fire with the shields up."
- "Sir, we cannot rotate while we are moving!!" — still referenced in the game's code, but can't actually be triggered.<ref>GECMDS.C, lines 685 and 717</ref> Used prior to version 3.2d.<ref>GEREADME.DOC#03/06/94 Release 3.2d</ref>
-"Sorry Sir! Sector scans are impossible in Hyperspace." — probably used in version 2.x.
-"Sorry Sir! The Hyper Scanners only work when we are in Hyperspace." — probably used in version 2.x.
-"Sorry Sir! The Long Range Scanners only work when we are in Hyperspace." — still referenced in the game's code, but can't actually be triggered.<ref>GECMDS.C, line 2739</ref> Probably used in version 2.x.
-"WHAT!!!! You lost your last ship! Giving you another ship is against my better judgment. But since you insist...."
-"I am very sorry, but the Galactic Monetary Reserve Bank has marked you a credit risk due to your outstanding debt, and has reduced the cash advance you are permitted."
-"The ships Quartermaster reports our food reserves are getting low, Sir!"
-"The galley reports we are out of food Sir! The men are fighting over what little supplies are left. We must replenish our supplies soon!"
-"We can't own a Wormhole!!!" — there is code in the game to handle trying to administer a wormhole<ref>GECMDS.C, lines 3477-3482</ref>, but since you can't orbit a wormhole, it's impossible to trigger it.
-"We have lost %s fighter(s) Sir!"
-"Uh oh! You have slipped to the #%d position in the Top Ten Players list."
-"Congratulations!! You are now #%d in the Top Ten Players list."
-"**** Hi score totals Reset ****"
-"Civilian Population...   %u" "Troops................   %u" "Missiles...............   %u" "Torpedoes..............   %u" "Ion Cannons...........   %u" "Fighters..............   %u" "Neutron Flux Pods......   %u" "Food Lots.............   %u" — all from an older version of the SCAN command
-"Hyperspace Scan  (s:%d %d)" — used in the SCAN HY command in version 2.x, the code for which is still in the game be can't be triggered.
-"Sorry Sir! The scanners cannot show planet detail from hyperspace." — probably also used in 2.x.
-"Sorry Sir! The scanners cannot show ship detail from hyperspace." — probably also used in 2.x.
-"USER-ID ...... OPTION SELECTED"
-"(line %02d)  ... (log-on)"
-"(line %02d)  ... (sign-up)"
-"%-11s... %s"
-"Warnings to intruders....... %c" — apparently shown in the ADMINSTER command in older versions, but disabled in 3.2e.<ref>GEMAIN.C, line 3023</ref>
-"You currently have in your fleet..."
-"You are being transported to your %s The %s..."
-"We can't spy on a wormhole!!!" — there is code in the game to handle trying to spy on a wormhole<ref>GECMDS.C, lines 6055-6060</ref>, but since you can't orbit a wormhole, it's impossible to trigger it.

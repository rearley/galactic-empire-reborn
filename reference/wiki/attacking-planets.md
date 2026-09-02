# Attacking planets

## Stages

### Preparation

### Fighters
If the amount of attacking fighters is less than 2% of the amount of the defending fighters, the attack is unsuccessful. All attacking troops are lost and no defending troops will be eliminated.<ref>GECMDS.C, line 3855</ref><ref>GEREADME.DOC#03/06/94 Release 3.2d</ref> Otherwise, the attack occurs as follows:

- If there are more than 500 troops on a planet, there is a 60% chance that those troops will shoot down some fighters. If this happens, you will see the message "Our fighters are being fired upon Sir!" The amount of fighters lost is a random value between 5% and 23% (by default), but this value is never shown by itself.<ref>GECMDS.C, lines 3834-3839</ref> This value is added to the eventual total of attacking fighters lost, but does not decrease the strength of the attack.
- The amount of attacking fighters lost is a random value between 20% and 120% of the amount of defending fighters (by default), plus the amount previously taken out by troops (if any).<ref>GECMDS.C, lines 3848-3849</ref> If there are at least five times as many defending fighters as attacking fighters, all attacking fighters will always be lost. If not all attacking fighters are lost in an attack, they return to the ship.
- The amount of defending fighters lost is a random value between 20% and 75% of the amount of attacking fighters (by default).<ref>GECMDS.C, lines 3857-3858</ref>
- If the amount of attacking fighters is at least 6% of the amount of the amount of defending fighters, the attack will also take out between 0 and 14 of each item (except fighters) on the planet as collateral damage.<ref>GECMDS.C, lines 3881-3897</ref>
- If all defending fighters are taken out and at least one attacking fighter remains, and there are fewer than five defending troops on the planet, the attacker wins the planet.<ref>GECMDS.C, lines 3899-3903</ref> If there are five or more defending troops on the planet, the planet does not change hands, and the attacker must take out the defending troops with troops.

### Troops
If the amount of attacking troops is less than 3% of the amount of the defending troops, the attack is unsuccessful. All attacking troops are lost and no defending troops will be eliminated.<ref>GECMDS.C, line 3674</ref> Otherwise, the attack occurs as follows:

- If you attack with troops while at least two fighters are still present on the planet, the fighters will take out anywhere between 9 and 43 troops per fighter.<ref>GECMDS.C, lines 3659-3668</ref> This value is added to the eventual total of attacking troops lost, but does not decrease the strength of the attack.
- The amount of attacking troops lost is a random value between 25% and 150% of the amount of defending troops (by default), plus the amount previously taken out by fighters (if any).<ref>GECMDS.C, line 3671</ref> If there are at least four times as many defending troops as attacking troops, all attacking troops will always be lost. If not all attacking troops are lost in an attack, they return to the ship (or surrender, see below).
- The amount of defending troops lost is a random value between 10% and 45% of the amount of attacking troops (by default).<ref>GECMDS.C, line 3676</ref>
- If all defending troops are eliminated, and there are no fighters on the planet, the attacker wins the planet.<ref>GECMDS.C, lines 3740-3743</ref> If the remaining amount of defending troops on a planet is less than 25% of the amount of attacking troops that survived, the attacker wins the planet, and the defending troops surrender and stay in the employ of the newly captured planet.<ref>GECMDS.C, lines 3698-3703</ref>
- If the amount of attacking troops that survive is less than 25% of the remaining defending troops, those troops surrender. A message is displayed that they have joined the ranks of the planet's troops<ref>GECMDS.C, lines 3705-3711</ref>, but due to a bug, this doesn't happen<ref>GECMDS.C, line 3745</ref> and they are simply eliminated instead.
- If the amount of troops that will be returning to the ship is more than half of the amount remaining on the planet, the attack will also take out between 0 and 14 of each item on the planet as collateral damage.<ref>GECMDS.C, line 3715</ref> (Among the items that can be shown as taken out are troops themselves, but due to a bug this value is not actually reduced.)
- Examples:
-* Example 1: 500 troops attack a planet with 35000 troops. Since the amount of attacking troops is less than 2% of the amount of defending troops, the attack is unsuccessful. All attacking troops are lost and no defending troops are taken out.
-* Example 2: 500 troops attack a planet with 2000 troops. Since 500 (2000×0.25) is the minimum amount of attacking troops that can be lost, all attacking troops will always be lost. The attacking troops will take out between 50 and 225 defending troops.
-* Example 3: 500 troops attack a planet with 1000 troops. The amount of attacking troops that can be lost is calculated as between 250 (1000×0.25) and 1500 (1000×1.5), but of course there were only 500 attacking troops. Therefore, there is a 80% chance all 500 troops will be lost, and a 20% chance that it will be between 250 and 500. The attacking troops will take out between 50 and 225 defending troops. Since the lowest amount of defending troops that can remain is 775, and the highest amount of attacking troops that can return is 250, collateral damage will never be triggered. It's likely that any attacking troops that do survive will surrender to the planetary forces (for example if 800 planetary troops remain and fewer than 200 attacking troops survive).
-* Example 4: 500 troops attack a planet with 500 troops. The amount of attacking troops that can be lost is calculated as between 125 (500×0.25) and 750 (500×1.5), but of course there were only 500 attacking troops. Therefore, there is a 40% chance all 500 troops will be lost, and a 60% chance that it will be between 125 and 500. The attacking troops will take out between 50 and 225 defending troops. The lowest amount of defending troops that can remain is 275, and the highest amount is 450. The highest amount of attacking troops that can return is 375, and the lowest amount is 0. If luck favors the attacker (for example, 300 attacking troops survive), collateral damage can be triggered. If luck favors the planetary forces (for example, 50 attacking troops survive), the surviving attackers may surrender.
-* Example 5: 500 troops attack a planet with 200 troops. The amount of attacking troops that can be lost is calculated as between 50 (200×0.25) and 300 (200×1.5). Some troops will always return. The amount of defending troops that can be taken out is between 50 is between 225, and since there are only 200 defending troops there is a 16.66% chance of taking out all the troops and winning the planet, and an 83.33% chance of taking out between 50 and 200. Since the highest amount of defending troops that can remain is 150, and the lowest amount of attacking troops that can return to the ship is 200, collateral damage will always be triggered.
-* Example 6: 5000 troops attack a planet with 200 troops. The amount of attacking troops that can be lost is calculated as between 50 (200×0.25) and 300 (200×1.5). Some troops will always return, and collateral damage will always be triggered. The minimum amount of defending troops that can be taken out is 500, and since there are fewer than 500 defending troops, all defending troops will always be lost and the planet will be won.
- Due to a bug, if a planet has no troops, it cannot be taken over with troops. The victory message will be displayed, but the planet will not change hands.<ref>GECMDS.C, lines 3760-3769</ref> To take it over, attack with a fighter or transfer down 1 troop, then attack with troops.

### YAAAA!
Once you've taken over the planet and your helm officer has exuberantly declared the planet is yours, go to planet administration:

- Rename the planet if you choose.
- Check the tax bank, and take the money if you wish.
- Check the tax rate, especially if you took over a **Free** planet. You don't want it revolt and have to take it over again!
- Adjust item production and pricing as you see fit.
- If there's a password, change it or remove it. Also make a note of it, the planet's former owner may be using it on other planets.
- Start building up defenses again (ion cannons, fighters, troops), either by changing production rates or doing supply runs. The planet will be an easy target now that you've eliminated its defenses.

More information: Colonizing planets

## Spies
Spies level of confidence is random number between 50 and 98.<ref>GEPLANET.C, line 168</ref> For example, if the spy has a level of confidence of 75, the amount of an item reported can be anywhere between 75% of the actual amount and 125% of the actual amount.<ref>GEPLANET.C, line 176</ref>

/*
  Warnings:

  - You are about to drop the column `navTargetX` on the `Ship` table. All the data in the column will be lost.
  - You are about to drop the column `navTargetY` on the `Ship` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ship" DROP COLUMN "navTargetX",
DROP COLUMN "navTargetY";

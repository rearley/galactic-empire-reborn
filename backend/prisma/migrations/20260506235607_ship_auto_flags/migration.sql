-- AlterTable
ALTER TABLE "Ship" ADD COLUMN     "autoRepair" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoShield" BOOLEAN NOT NULL DEFAULT false;

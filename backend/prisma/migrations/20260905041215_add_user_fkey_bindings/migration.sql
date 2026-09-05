-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fkeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

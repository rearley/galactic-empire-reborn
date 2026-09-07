-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ALTER COLUMN "username" DROP NOT NULL;

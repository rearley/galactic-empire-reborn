-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userid" TEXT NOT NULL,
    "username" TEXT,
    "text" TEXT NOT NULL,
    "shipno" INTEGER,
    "shipname" TEXT,
    "shpclass" INTEGER,
    "xcoord" DOUBLE PRECISION,
    "ycoord" DOUBLE PRECISION,
    "damage" DOUBLE PRECISION,
    "version" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugReport_createdAt_idx" ON "BugReport"("createdAt");

-- CreateIndex
CREATE INDEX "BugReport_status_createdAt_idx" ON "BugReport"("status", "createdAt");

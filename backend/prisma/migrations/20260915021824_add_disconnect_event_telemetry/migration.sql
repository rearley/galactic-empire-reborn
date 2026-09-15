-- CreateTable
CREATE TABLE "DisconnectEvent" (
    "id" TEXT NOT NULL,
    "userid" TEXT NOT NULL,
    "shipno" INTEGER NOT NULL,
    "username" TEXT,
    "reason" TEXT,
    "cantexit" INTEGER NOT NULL,
    "killed" BOOLEAN NOT NULL,
    "xcoord" DOUBLE PRECISION NOT NULL,
    "ycoord" DOUBLE PRECISION NOT NULL,
    "speed" INTEGER NOT NULL,
    "disconnectedAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "returnedAfterMs" INTEGER,

    CONSTRAINT "DisconnectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisconnectEvent_userid_returnedAt_idx" ON "DisconnectEvent"("userid", "returnedAt");

-- CreateIndex
CREATE INDEX "DisconnectEvent_disconnectedAt_idx" ON "DisconnectEvent"("disconnectedAt");

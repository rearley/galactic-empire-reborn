-- CreateTable
CREATE TABLE "MidnightRun" (
    "runDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "usersUpdated" INTEGER NOT NULL,
    "planetsProcessed" INTEGER NOT NULL,
    "mailReportsCreated" INTEGER NOT NULL,
    "mailDeleted" INTEGER NOT NULL,
    "teamsReconciled" INTEGER NOT NULL,
    "teamsRemoved" INTEGER NOT NULL,

    CONSTRAINT "MidnightRun_pkey" PRIMARY KEY ("runDate")
);

-- CreateTable
CREATE TABLE "User" (
    "userid" TEXT NOT NULL,
    "score" BIGINT NOT NULL DEFAULT 0,
    "noships" INTEGER NOT NULL DEFAULT 0,
    "topshipno" INTEGER NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "rospos" INTEGER NOT NULL DEFAULT 0,
    "planets" INTEGER NOT NULL DEFAULT 0,
    "cash" BIGINT NOT NULL DEFAULT 0,
    "debt" BIGINT NOT NULL DEFAULT 0,
    "plscore" BIGINT NOT NULL DEFAULT 0,
    "klscore" BIGINT NOT NULL DEFAULT 0,
    "population" BIGINT NOT NULL DEFAULT 0,
    "options" INTEGER[],
    "teamcode" BIGINT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userid")
);

-- CreateTable
CREATE TABLE "Ship" (
    "userid" TEXT NOT NULL,
    "shipno" INTEGER NOT NULL,
    "shipname" TEXT NOT NULL,
    "shpclass" INTEGER NOT NULL,
    "heading" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "head2b" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "speed2b" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "xcoord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ycoord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "damage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "energy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "phasr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "phasrtype" INTEGER NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "lastfired" INTEGER NOT NULL DEFAULT 0,
    "shieldtype" INTEGER NOT NULL DEFAULT 0,
    "shieldstat" INTEGER NOT NULL DEFAULT 0,
    "shield" INTEGER NOT NULL DEFAULT 0,
    "cloak" INTEGER NOT NULL DEFAULT 0,
    "degrees" INTEGER NOT NULL DEFAULT 0,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "tactical" INTEGER NOT NULL DEFAULT 0,
    "helm" INTEGER NOT NULL DEFAULT 0,
    "train" INTEGER NOT NULL DEFAULT 0,
    "where" INTEGER NOT NULL DEFAULT 0,
    "ltorpsChannel" INTEGER[],
    "ltorpsDistance" INTEGER[],
    "lmisslChannel" INTEGER[],
    "lmisslDistance" INTEGER[],
    "lmisslEnergy" INTEGER[],
    "decout" INTEGER[],
    "jammer" INTEGER NOT NULL DEFAULT 0,
    "freq" INTEGER[],
    "items" BIGINT[],
    "titem" INTEGER NOT NULL DEFAULT 0,
    "hostile" INTEGER NOT NULL DEFAULT 0,
    "cantexit" INTEGER NOT NULL DEFAULT 0,
    "repair" INTEGER NOT NULL DEFAULT 0,
    "hypha" INTEGER NOT NULL DEFAULT 0,
    "firecntl" INTEGER NOT NULL DEFAULT 0,
    "destruct" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "cybmine" INTEGER NOT NULL DEFAULT 0,
    "cybskill" INTEGER NOT NULL DEFAULT 0,
    "cybupdate" INTEGER NOT NULL DEFAULT 0,
    "tick" INTEGER NOT NULL DEFAULT 0,
    "emulate" INTEGER NOT NULL DEFAULT 0,
    "minesnear" INTEGER NOT NULL DEFAULT 0,
    "lock" INTEGER NOT NULL DEFAULT 0,
    "holdcourse" INTEGER NOT NULL DEFAULT 0,
    "topspeed" INTEGER NOT NULL DEFAULT 0,
    "warncntr" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Ship_pkey" PRIMARY KEY ("userid","shipno")
);

-- CreateTable
CREATE TABLE "Sector" (
    "xsect" INTEGER NOT NULL,
    "ysect" INTEGER NOT NULL,
    "plnum" INTEGER NOT NULL DEFAULT 0,
    "type" INTEGER NOT NULL DEFAULT 0,
    "numplan" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("xsect","ysect")
);

-- CreateTable
CREATE TABLE "Planet" (
    "xsect" INTEGER NOT NULL,
    "ysect" INTEGER NOT NULL,
    "plnum" INTEGER NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "xcoord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ycoord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "userid" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "enviorn" INTEGER NOT NULL DEFAULT 0,
    "resource" INTEGER NOT NULL DEFAULT 0,
    "cash" BIGINT NOT NULL DEFAULT 0,
    "debt" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "taxrate" INTEGER NOT NULL DEFAULT 0,
    "warnings" INTEGER NOT NULL DEFAULT 0,
    "password" TEXT NOT NULL DEFAULT '',
    "lastattack" TEXT NOT NULL DEFAULT '',
    "beacon" TEXT NOT NULL DEFAULT '',
    "spyowner" TEXT NOT NULL DEFAULT '',
    "technology" INTEGER NOT NULL DEFAULT 0,
    "teamcode" BIGINT NOT NULL DEFAULT 0,
    "itemsQty" BIGINT[],
    "itemsRate" INTEGER[],
    "itemsSell" INTEGER[],
    "itemsReserve" INTEGER[],
    "itemsMarkup2a" INTEGER[],
    "itemsSold2a" BIGINT[],

    CONSTRAINT "Planet_pkey" PRIMARY KEY ("xsect","ysect","plnum")
);

-- CreateTable
CREATE TABLE "Wormhole" (
    "xsect" INTEGER NOT NULL,
    "ysect" INTEGER NOT NULL,
    "plnum" INTEGER NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "xcoord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ycoord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "visible" INTEGER NOT NULL DEFAULT 0,
    "destXcoord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "destYcoord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Wormhole_pkey" PRIMARY KEY ("xsect","ysect","plnum")
);

-- CreateTable
CREATE TABLE "Team" (
    "teamcode" BIGINT NOT NULL,
    "teamname" TEXT NOT NULL DEFAULT '',
    "teamcount" INTEGER NOT NULL DEFAULT 0,
    "teamscore" BIGINT NOT NULL DEFAULT 0,
    "password" TEXT NOT NULL DEFAULT '',
    "secret" TEXT NOT NULL DEFAULT '',
    "flag" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("teamcode")
);

-- CreateTable
CREATE TABLE "Mail" (
    "userid" TEXT NOT NULL,
    "class" INTEGER NOT NULL,
    "msgno" BIGINT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "stamp" INTEGER NOT NULL DEFAULT 0,
    "dtime" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "string1" TEXT NOT NULL DEFAULT '',
    "name1" TEXT NOT NULL DEFAULT '',
    "name2" TEXT NOT NULL DEFAULT '',
    "int1" INTEGER NOT NULL DEFAULT 0,
    "int2" INTEGER NOT NULL DEFAULT 0,
    "int3" INTEGER NOT NULL DEFAULT 0,
    "long1" BIGINT NOT NULL DEFAULT 0,
    "long2" BIGINT NOT NULL DEFAULT 0,
    "long3" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Mail_pkey" PRIMARY KEY ("userid","class","msgno")
);

-- CreateTable
CREATE TABLE "MailStat" (
    "userid" TEXT NOT NULL,
    "class" INTEGER NOT NULL,
    "msgno" BIGINT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "stamp" INTEGER NOT NULL DEFAULT 0,
    "dtime" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "name1" TEXT NOT NULL DEFAULT '',
    "int1" INTEGER NOT NULL DEFAULT 0,
    "int2" INTEGER NOT NULL DEFAULT 0,
    "cash" BIGINT NOT NULL DEFAULT 0,
    "debt" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "itemqty" BIGINT[],

    CONSTRAINT "MailStat_pkey" PRIMARY KEY ("userid","class","msgno")
);

-- CreateTable
CREATE TABLE "ShipClass" (
    "classNumber" INTEGER NOT NULL,
    "typeName" TEXT NOT NULL,
    "shipNameTemplate" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "maxShields" INTEGER NOT NULL,
    "maxPhaser" INTEGER NOT NULL,
    "hasTorpedo" BOOLEAN NOT NULL,
    "hasMissile" BOOLEAN NOT NULL,
    "hasDecoy" BOOLEAN NOT NULL,
    "hasJammer" BOOLEAN NOT NULL,
    "hasZipper" BOOLEAN NOT NULL,
    "hasMine" BOOLEAN NOT NULL,
    "canAttackPlanet" BOOLEAN NOT NULL,
    "hasCloak" BOOLEAN NOT NULL,
    "maxAcceleration" INTEGER NOT NULL,
    "maxWarp" INTEGER NOT NULL,
    "maxTons" INTEGER NOT NULL,
    "maxPrice" BIGINT NOT NULL,
    "scanRange" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "damageFactor" INTEGER NOT NULL,
    "cybCanAttack" BOOLEAN NOT NULL,
    "cybLowestClassAttacks" INTEGER NOT NULL,
    "noClaim" INTEGER NOT NULL,
    "make" INTEGER NOT NULL,
    "tough" INTEGER NOT NULL,

    CONSTRAINT "ShipClass_pkey" PRIMARY KEY ("classNumber")
);

-- CreateTable
CREATE TABLE "GalaxyMeta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "seed" BIGINT NOT NULL,
    "plodds" INTEGER NOT NULL,
    "wormodds" INTEGER NOT NULL,
    "maxplanets" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalaxyMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mine" (
    "id" SERIAL NOT NULL,
    "channel" INTEGER NOT NULL,
    "timer" INTEGER NOT NULL,
    "xcoord" DOUBLE PRECISION NOT NULL,
    "ycoord" DOUBLE PRECISION NOT NULL,
    "deployedBy" TEXT NOT NULL,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mine_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Ship" ADD CONSTRAINT "Ship_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("userid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mail" ADD CONSTRAINT "Mail_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("userid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailStat" ADD CONSTRAINT "MailStat_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("userid") ON DELETE RESTRICT ON UPDATE CASCADE;

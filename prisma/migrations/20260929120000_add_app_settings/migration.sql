CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

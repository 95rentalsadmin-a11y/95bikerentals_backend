ALTER TABLE "Booking" ADD COLUMN "lateFeeStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "depositStatus" TEXT NOT NULL DEFAULT 'held',
ADD COLUMN "depositRefundAmount" INTEGER NOT NULL DEFAULT 0;

-- Link legacy bookings to customer records so database-level customer
-- pagination does not hide customers created before customerId was added.
INSERT INTO "Customer" ("id", "phone", "name", "email", "address", "idProof", "createdAt", "updatedAt")
SELECT DISTINCT ON ("customerPhone")
  md5('customer:' || "customerPhone")::uuid,
  "customerPhone", "customerName", "customerEmail", "customerAddress", "idProof", "createdAt", "updatedAt"
FROM "Booking"
WHERE "customerPhone" IS NOT NULL
ORDER BY "customerPhone", "createdAt" DESC
ON CONFLICT ("phone") DO NOTHING;

UPDATE "Booking" b
SET "customerId" = c."id"
FROM "Customer" c
WHERE b."customerPhone" = c."phone"
  AND b."customerId" IS NULL;

UPDATE "Customer" c
SET "totalBookings" = stats."totalBookings",
    "totalSpent" = stats."totalSpent"
FROM (
  SELECT "customerId",
         COUNT(*)::integer AS "totalBookings",
         COALESCE(SUM(CASE WHEN "status" <> 'cancelled' THEN "calculatedRate" ELSE 0 END), 0)::integer AS "totalSpent"
  FROM "Booking"
  WHERE "customerId" IS NOT NULL
  GROUP BY "customerId"
) stats
WHERE c."id" = stats."customerId";

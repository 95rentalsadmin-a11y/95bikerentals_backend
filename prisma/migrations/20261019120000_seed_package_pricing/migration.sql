-- Backfill package pricing for the original seeded bikes without overwriting
-- prices that an admin may already have configured.
UPDATE "Bike"
SET "price1Day" = CASE WHEN "id" = '5' THEN 800 ELSE 580 END,
    "price2Days" = CASE WHEN "id" = '5' THEN 1600 ELSE 1160 END,
    "price3Days" = CASE WHEN "id" = '5' THEN 2400 ELSE 1740 END,
    "price7Days" = CASE WHEN "id" = '5' THEN 4800 ELSE 3333 END
WHERE "price1Day" = 0
  AND "price2Days" = 0
  AND "price3Days" = 0
  AND "price7Days" = 0;

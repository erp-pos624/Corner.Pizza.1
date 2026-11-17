-- Cash-on-delivery flag: driver collects payment at the door and hands it over
-- at the end of the delivery shift.
ALTER TABLE "orders" ADD COLUMN "isCod" BOOLEAN NOT NULL DEFAULT false;

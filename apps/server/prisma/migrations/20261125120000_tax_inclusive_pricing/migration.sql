-- Tax-inclusive pricing and per-weekday online hours.
-- Additive only: no rows are rewritten except through column defaults.

-- Menu prices are entered VAT-inclusive by default; existing items become inclusive.
ALTER TABLE "menu_items" ADD COLUMN "taxInclusive" BOOLEAN NOT NULL DEFAULT true;

-- Historic order lines were all priced tax-exclusive, so their snapshot is false.
ALTER TABLE "order_items" ADD COLUMN "taxInclusive" BOOLEAN NOT NULL DEFAULT false;

-- VAT contained in inclusive prices; zero for every historic order.
ALTER TABLE "orders" ADD COLUMN "taxIncluded" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Optional per-weekday online opening hours.
ALTER TABLE "branches" ADD COLUMN "onlineWeeklyHours" JSONB;

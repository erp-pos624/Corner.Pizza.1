-- Rebrand the persisted restaurant identity from Forno to Corner Pizza.
-- Only user-visible strings change; identifiers such as cookies, JWTs and
-- storage keys are intentionally left untouched.

ALTER TABLE "restaurant_settings" ALTER COLUMN "name" SET DEFAULT 'Corner Pizza';

UPDATE "restaurant_settings"
SET "name" = 'Corner Pizza',
    "nameAr" = 'كورنر بيتزا',
    "tagline" = 'Fresh from the oven, made to be shared.',
    "taglineAr" = 'بيتزا طازجة من الفرن، صُنعت لتُشارَك.',
    "receiptFooter" = 'Thank you for choosing Corner Pizza. Baked fresh, served with love.',
    "receiptFooterAr" = 'شكرًا لاختياركم كورنر بيتزا. مخبوزة طازجة وبكل حب.',
    "email" = CASE
      WHEN "email" = 'hello@forno.local' THEN 'hello@eatcornerpizza.com'
      ELSE "email"
    END;

UPDATE "branches"
SET "name" = replace("name", 'Forno', 'Corner'),
    "nameAr" = replace("nameAr", 'فورنو', 'كورنر')
WHERE "name" LIKE '%Forno%' OR "nameAr" LIKE '%فورنو%';

UPDATE "menu_items"
SET "name" = 'Corner Special',
    "nameAr" = 'سبيشال كورنر',
    "sku" = 'PIZZA-CORNER'
WHERE "name" = 'Forno Signature';

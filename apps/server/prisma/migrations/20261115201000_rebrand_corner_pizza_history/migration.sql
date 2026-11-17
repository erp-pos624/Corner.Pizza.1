-- Finish the Corner Pizza rebrand in historical, denormalized rows.
-- `forno-asset:` image URLs and cookies/JWT identifiers stay untouched.

UPDATE "order_items"
SET "menuItemName" = 'Corner Special',
    "menuItemNameAr" = 'سبيشال كورنر'
WHERE "menuItemName" = 'Forno Signature'
   OR "menuItemNameAr" = 'فورنو سيجنتشر';

UPDATE "inventory_movements"
SET "note" = 'Corner Special'
WHERE "note" = 'Forno Signature';

UPDATE "users"
SET "email" = replace("email", '@forno.local', '@cornerpizza.local')
WHERE "email" LIKE '%@forno.local';

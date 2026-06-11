UPDATE "Company"
SET "currency" = CASE
  WHEN "market" = 'EGYPTIAN' THEN 'EGP'
  ELSE 'USD'
END
WHERE "currency" NOT IN ('USD', 'EGP')
   OR ("market" = 'EGYPTIAN' AND "currency" <> 'EGP');

UPDATE np_warehouses w
SET city_ref = NULL
WHERE city_ref IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM np_cities c
    WHERE c.ref = w.city_ref
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'np_warehouses_city_ref_np_cities_ref_fk'
  ) THEN
    ALTER TABLE np_warehouses
      ADD CONSTRAINT np_warehouses_city_ref_np_cities_ref_fk
      FOREIGN KEY (city_ref) REFERENCES np_cities(ref)
      ON DELETE SET NULL;
  END IF;
END
$$;
ALTER TABLE np_warehouses
  DROP CONSTRAINT IF EXISTS np_warehouses_settlement_ref_np_cities_ref_fk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'np_warehouses_city_ref_np_cities_ref_fk'
  ) THEN
    ALTER TABLE np_warehouses
      ADD CONSTRAINT np_warehouses_city_ref_np_cities_ref_fk
      FOREIGN KEY (city_ref) REFERENCES np_cities(ref)
      ON DELETE SET NULL;
  END IF;
END
$$;
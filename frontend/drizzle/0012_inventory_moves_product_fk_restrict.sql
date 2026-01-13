DO $$
BEGIN
  IF EXISTS (
    SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'inventory_moves'
  ) THEN
  ALTER TABLE inventory_moves
      DROP CONSTRAINT IF EXISTS inventory_moves_product_id_fkey;

  ALTER TABLE inventory_moves
      ADD CONSTRAINT inventory_moves_product_id_fkey
      FOREIGN KEY (product_id)
      REFERENCES products(id)
  ON DELETE RESTRICT;
END IF;
END $$;
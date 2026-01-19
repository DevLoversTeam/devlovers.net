DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'stripe_events_order_id_orders_id_fk'
      AND c.conrelid = 'public.stripe_events'::regclass
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%ON DELETE CASCADE%'
  ) THEN
    ALTER TABLE public.stripe_events
      DROP CONSTRAINT stripe_events_order_id_orders_id_fk;

    ALTER TABLE public.stripe_events
      ADD CONSTRAINT stripe_events_order_id_orders_id_fk
      FOREIGN KEY (order_id) REFERENCES public.orders(id)
      ON DELETE CASCADE;
  END IF;
END $$;

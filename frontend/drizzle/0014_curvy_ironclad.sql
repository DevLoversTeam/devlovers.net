CREATE INDEX IF NOT EXISTS idx_orders_user_id_created_at
  ON public.orders (user_id, created_at);

alter table inventory_moves
  drop constraint if exists inventory_moves_product_id_fkey;
--> statement-breakpoint
alter table inventory_moves
  add constraint inventory_moves_product_id_fkey
  foreign key (product_id) references products(id) on delete restrict;

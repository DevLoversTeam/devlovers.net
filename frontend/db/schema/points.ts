import {
  pgTable,
  uuid,
  text,
  integer,
  varchar,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const pointTransactions = pgTable('point_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  points: integer('points').notNull().default(0),
  source: varchar('source', { length: 50 }).notNull().default('quiz'),
  sourceId: uuid('source_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
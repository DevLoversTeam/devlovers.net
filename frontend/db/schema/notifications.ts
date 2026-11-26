import { relations, sql } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { users } from './users';

export const notifications = pgTable('notifications', {
  id: text('id')
    .primaryKey()
    .notNull()
    .default(sql`gen_random_uuid()`),

  userId: text('user_id').references(() => users.id, {
    onDelete: 'cascade',
  }),

  type: text('type').notNull(),

  title: text('title').notNull(),

  message: text('message').notNull(),

  isRead: boolean('is_read').notNull().default(false),

  metadata: jsonb('metadata'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

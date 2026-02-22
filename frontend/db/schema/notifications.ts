import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { users } from './users';

export const notifications = pgTable('notifications', {
  id: text('id')
    .primaryKey()
    .notNull()
    .default(sql`gen_random_uuid()`),

  userId: text('user_id').references(() => users.id, {
    onDelete: 'cascade',
  }),

  // e.g., 'ACHIEVEMENT', 'ARTICLE', 'SYSTEM'
  type: text('type').notNull(),

  title: text('title').notNull(),

  message: text('message').notNull(),

  isRead: boolean('is_read').notNull().default(false),

  // Store arbitrary data like { badgeId: 'flawless' } or { articleSlug: 'new-react-compiler' }
  metadata: jsonb('metadata'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

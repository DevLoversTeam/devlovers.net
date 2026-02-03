import { index,pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const activeSessions = pgTable(
  'active_sessions',
  {
    sessionId: text('session_id').primaryKey(),
    lastActivity: timestamp('last_activity').notNull().defaultNow(),
  },
  table => ({
    lastActivityIdx: index('active_sessions_last_activity_idx').on(
      table.lastActivity
    ),
  })
);

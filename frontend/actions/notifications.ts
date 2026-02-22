'use server';

import { desc, eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db';
import { notifications } from '@/db/schema/notifications';

import { getCurrentUser } from '@/lib/auth';

export async function getNotifications() {
  const session = await getCurrentUser();
  if (!session) return [];
  
  try {
    const data = await db.query.notifications.findMany({
      where: eq(notifications.userId, session.id),
      orderBy: [desc(notifications.createdAt)],
      limit: 20,
    });
    return data;
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return [];
  }
}

export async function markAsRead(notificationId: string) {
  const session = await getCurrentUser();
  if (!session || !notificationId) return { success: false };

  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, session.id)
        )
      );

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    return { success: false };
  }
}

export async function markAllAsRead() {
  const session = await getCurrentUser();
  if (!session) return { success: false };

  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, session.id), eq(notifications.isRead, false)));

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    return { success: false };
  }
}

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata?: any;
}) {
  if (!data.userId) return null;

  try {
    const [result] = await db
      .insert(notifications)
      .values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata || null,
      })
      .returning();

    revalidatePath('/', 'layout');
    return result;
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
}

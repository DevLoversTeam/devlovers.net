'use server';

import bcrypt from 'bcryptjs';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';

import { getUserProfile, updateUser } from '@/db/queries/users';
import { getCurrentUser } from '@/lib/auth';

import { createNotification } from './notifications';

export async function updateName(formData: FormData) {
  const session = await getCurrentUser();
  if (!session) {
    return { error: 'Unauthorized' };
  }

  const name = formData.get('name') as string;
  if (!name || name.trim().length === 0) {
    return { error: 'Name is required' };
  }

  try {
    await updateUser(session.id, { name: name.trim() });
    
    // Create notification
    const tNotify = await getTranslations('notifications.account');
    await createNotification({
      userId: session.id,
      type: 'SYSTEM',
      title: tNotify('nameChanged.title'),
      message: tNotify('nameChanged.message', { name: name.trim() }),
    });

    revalidatePath('/[locale]/dashboard', 'page');
    return { success: true };
  } catch (error) {
    console.error('Failed to update name:', error);
    return { error: 'Failed to update name' };
  }
}

export async function updatePassword(formData: FormData) {
  const session = await getCurrentUser();
  if (!session) {
    return { error: 'Unauthorized' };
  }

  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;

  if (!currentPassword || !newPassword) {
    return { error: 'Both current and new passwords are required' };
  }

  if (newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters long' };
  }

  try {
    // Better to fetch specifically for verification
    const { db } = await import('@/db');
    const { users } = await import('@/db/schema/users');
    const { eq } = await import('drizzle-orm');
    
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.id),
    });

    if (!dbUser || !dbUser.passwordHash) {
      return { error: 'Password not set for this account (Social Login?)' };
    }

    const isValid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!isValid) {
      return { error: 'Invalid current password' };
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await updateUser(session.id, { passwordHash: newPasswordHash });

    // Create notification
    const tNotify = await getTranslations('notifications.account');
    await createNotification({
      userId: session.id,
      type: 'SYSTEM',
      title: tNotify('passwordChanged.title'),
      message: tNotify('passwordChanged.message'),
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to update password:', error);
    return { error: 'Failed to update password' };
  }
}

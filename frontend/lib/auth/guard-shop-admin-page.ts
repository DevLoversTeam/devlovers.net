import { notFound, redirect } from 'next/navigation';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminPage,
} from '@/lib/auth/admin';

export async function guardShopAdminPage(): Promise<void> {
  try {
    await requireAdminPage();
  } catch (err) {
    if (err instanceof AdminApiDisabledError) notFound();
    if (err instanceof AdminUnauthorizedError) redirect('/login');
    if (err instanceof AdminForbiddenError) notFound();
    throw err;
  }
}

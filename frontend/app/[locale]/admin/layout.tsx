import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { guardAdminPage } from '@/lib/auth/guard-admin-page';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardAdminPage();

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

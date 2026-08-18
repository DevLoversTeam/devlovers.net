import { LoginForm } from '@/components/auth/LoginForm';
import { getSafeRedirect } from '@/lib/auth/safe-redirect';
import { getLastLoginMethod } from '@/lib/auth-last-login';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { locale } = await params;
  const { returnTo: returnToParam } = await searchParams;

  const returnTo = getSafeRedirect(returnToParam);
  const lastLoginMethod = await getLastLoginMethod();

  return (
    <LoginForm
      locale={locale}
      returnTo={returnTo}
      lastLoginMethod={lastLoginMethod}
    />
  );
}

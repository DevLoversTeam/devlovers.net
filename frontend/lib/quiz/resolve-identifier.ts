import { verifyAuthToken } from '@/lib/auth';

export function resolveRequestIdentifier(headersList: Headers): string | null {
  const cookieHeader = headersList.get('cookie') ?? '';
  const authCookie = cookieHeader
    .split(';')
    .find(c => c.trim().startsWith('auth_session='));

  if (authCookie) {
    const token = authCookie.split('=').slice(1).join('=').trim();
    const payload = verifyAuthToken(token);
    return payload?.userId ?? null;
  }

  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    null
  );
}

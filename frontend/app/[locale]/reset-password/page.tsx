'use client';

import { useSearchParams } from 'next/navigation';

import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  return <ResetPasswordForm token={token} />;
}

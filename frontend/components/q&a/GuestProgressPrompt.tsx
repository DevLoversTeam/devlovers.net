'use client';

import { useTranslations } from 'next-intl';

import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useRouter } from '@/i18n/routing';

type GuestProgressPromptProps = {
  isOpen: boolean;
  returnTo: string;
  onClose: () => void;
};

export function GuestProgressPrompt({
  isOpen,
  returnTo,
  onClose,
}: GuestProgressPromptProps) {
  const t = useTranslations('qa.guestProgress');
  const router = useRouter();

  const handleLogin = () => {
    const loginUrl = `/login?returnTo=${encodeURIComponent(returnTo)}`;
    onClose();
    router.push(loginUrl);
  };

  return (
    <ConfirmModal
      isOpen={isOpen}
      role="dialog"
      title={t('title')}
      message={t('description')}
      confirmText={t('login')}
      cancelText={t('continue')}
      onConfirm={handleLogin}
      onCancel={onClose}
    />
  );
}

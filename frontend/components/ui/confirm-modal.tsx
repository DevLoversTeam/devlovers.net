'use client';

import { Button } from '@/components/ui/button';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const confirmButtonClass = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    default: 'bg-blue-600 hover:bg-blue-700 text-white',
  }[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative mx-4 max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        <p className="mb-6 text-gray-600 dark:text-gray-400">{message}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            className={`flex-1 ${confirmButtonClass}`}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

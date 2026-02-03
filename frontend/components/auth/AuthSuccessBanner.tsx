import type { ReactNode } from 'react';

type AuthSuccessBannerProps = {
  message: ReactNode;
  footer?: ReactNode;
};

export function AuthSuccessBanner({ message, footer }: AuthSuccessBannerProps) {
  return (
    <div className="rounded-md border border-green-400 bg-green-50 p-4 text-sm text-green-800">
      <div>{message}</div>

      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

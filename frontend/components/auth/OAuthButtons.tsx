import type { LastLoginMethod } from '@/lib/auth-last-login';

import { GitHubIcon } from './icons/GitHubIcon';
import { GoogleIcon } from './icons/GoogleIcon';
import { ProviderButton } from './ProviderButton';

export function OAuthButtons({
  lastLoginMethod = null,
}: {
  lastLoginMethod?: LastLoginMethod | null;
}) {
  return (
    <div className="space-y-2">
      <ProviderButton
        provider="google"
        label="Continue with Google"
        icon={<GoogleIcon className="h-4 w-4" />}
        isLastUsed={lastLoginMethod === 'google'}
      />

      <ProviderButton
        provider="github"
        label="Continue with GitHub"
        icon={<GitHubIcon className="h-4 w-4" />}
        isLastUsed={lastLoginMethod === 'github'}
      />
    </div>
  );
}

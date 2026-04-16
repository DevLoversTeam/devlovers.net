import 'server-only';

import { readServerEnv } from './server-env';

const PLACEHOLDER_SEGMENTS = new Set([
  'test',
  'testing',
  'dummy',
  'placeholder',
  'example',
  'sample',
  'fake',
  'mock',
  'demo',
  'local',
  'localhost',
  'staging',
  'sandbox',
  'changeme',
  'replace',
  'todo',
  'invalid',
]);

type ProviderName = 'stripe' | 'monobank' | 'nova_poshta';

type ProviderStringValidationArgs = {
  provider: ProviderName;
  envName: string;
  value: string;
  minLength?: number;
  requiredPrefix?: string;
};

type ProviderUrlValidationArgs = {
  provider: ProviderName;
  envName: string;
  value: string;
};

type ProviderPhoneValidationArgs = {
  provider: ProviderName;
  envName: string;
  value: string;
};

export class ShopProviderConfigError extends Error {
  readonly provider: ProviderName;
  readonly envName: string;

  constructor(args: {
    provider: ProviderName;
    envName: string;
    message: string;
  }) {
    super(args.message);
    this.name = 'ShopProviderConfigError';
    this.provider = args.provider;
    this.envName = args.envName;
  }
}

export function isProductionLikeRuntime(): boolean {
  const appEnv = String(readServerEnv('APP_ENV') ?? '')
    .trim()
    .toLowerCase();
  const nodeEnv = String(readServerEnv('NODE_ENV') ?? process.env.NODE_ENV ?? '')
    .trim()
    .toLowerCase();
  return appEnv === 'production' || nodeEnv === 'production';
}

function splitSegments(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasPlaceholderLikeValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;

  if (
    /^(test|dummy|placeholder|example|sample|fake|mock|demo|changeme|replace|todo|invalid)$/.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /(?:^|[_-])(test|dummy|placeholder|example|sample|fake|mock|demo|local|staging|sandbox|changeme|replace|todo|invalid)(?:[_-]|$)/.test(
      normalized
    )
  ) {
    return true;
  }

  return splitSegments(normalized).some(segment =>
    PLACEHOLDER_SEGMENTS.has(segment)
  );
}

function throwProviderConfigError(
  provider: ProviderName,
  envName: string,
  reason: string
): never {
  throw new ShopProviderConfigError({
    provider,
    envName,
    message: `${provider} provider config is invalid for production runtime: ${envName} ${reason}`,
  });
}

export function assertProductionLikeProviderString(
  args: ProviderStringValidationArgs
): void {
  if (!isProductionLikeRuntime()) return;

  const trimmed = args.value.trim();
  if (!trimmed) {
    throwProviderConfigError(args.provider, args.envName, 'must be non-empty.');
  }

  if ((args.minLength ?? 1) > trimmed.length) {
    throwProviderConfigError(
      args.provider,
      args.envName,
      `is too short to be a valid production value.`
    );
  }

  if (args.requiredPrefix && !trimmed.startsWith(args.requiredPrefix)) {
    throwProviderConfigError(
      args.provider,
      args.envName,
      `must start with ${args.requiredPrefix}.`
    );
  }

  if (hasPlaceholderLikeValue(trimmed)) {
    throwProviderConfigError(
      args.provider,
      args.envName,
      'looks like a placeholder or test value.'
    );
  }
}

export function assertProductionLikeProviderUrl(
  args: ProviderUrlValidationArgs
): void {
  if (!isProductionLikeRuntime()) return;

  const trimmed = args.value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throwProviderConfigError(
      args.provider,
      args.envName,
      'must be a valid URL.'
    );
  }

  if (url.protocol !== 'https:') {
    throwProviderConfigError(
      args.provider,
      args.envName,
      'must use https in production runtime.'
    );
  }

  const host = url.hostname.trim().toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.test') ||
    host.endsWith('.example') ||
    host.endsWith('.invalid') ||
    host.endsWith('.local')
  ) {
    throwProviderConfigError(
      args.provider,
      args.envName,
      'must not point at a local/test host.'
    );
  }
}

export function assertProductionLikeProviderPhone(
  args: ProviderPhoneValidationArgs
): void {
  if (!isProductionLikeRuntime()) return;

  const digits = args.value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throwProviderConfigError(
      args.provider,
      args.envName,
      'must contain a valid production phone number.'
    );
  }

  if (/^(\d)\1+$/.test(digits)) {
    throwProviderConfigError(
      args.provider,
      args.envName,
      'must not be a repeated placeholder phone number.'
    );
  }

  if (hasPlaceholderLikeValue(args.value)) {
    throwProviderConfigError(
      args.provider,
      args.envName,
      'looks like a placeholder or test value.'
    );
  }
}

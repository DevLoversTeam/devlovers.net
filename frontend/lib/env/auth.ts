import { readServerEnv } from './server-env';

type AppEnv = 'local' | 'develop' | 'production';

const validAppEnvs: AppEnv[] = ['local', 'develop', 'production'];

const rawAppEnv = readServerEnv('APP_ENV')?.toLowerCase();
const context = readServerEnv('CONTEXT')?.toLowerCase();

const inferredAppEnv: AppEnv | undefined =
  context === 'production'
    ? 'production'
    : context
      ? 'develop'
      : undefined;

const resolvedAppEnv = (rawAppEnv ?? inferredAppEnv) as AppEnv | undefined;

if (!resolvedAppEnv || !validAppEnvs.includes(resolvedAppEnv)) {
  throw new Error(
    `Invalid APP_ENV: ${rawAppEnv ?? '<undefined>'}. Must be one of: ${validAppEnvs.join(', ')}`
  );
}

const APP_ENV: AppEnv = resolvedAppEnv;

function requireEnv(name: string): string {
  const value = readServerEnv(name);
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const authEnv = {
  appEnv: APP_ENV,

    google:
    APP_ENV === 'local'
      ? {
          clientId: requireEnv('GOOGLE_CLIENT_ID_LOCAL'),
          clientSecret: requireEnv('GOOGLE_CLIENT_SECRET_LOCAL'),
          redirectUri: requireEnv('GOOGLE_CLIENT_REDIRECT_URI_LOCAL'),
        }
      : APP_ENV === 'develop'
        ? {
            clientId: requireEnv('GOOGLE_CLIENT_ID_DEVELOP'),
            clientSecret: requireEnv('GOOGLE_CLIENT_SECRET_DEVELOP'),
            redirectUri: requireEnv('GOOGLE_CLIENT_REDIRECT_URI_DEVELOP'),
          }
        : {
            clientId: requireEnv('GOOGLE_CLIENT_ID_PROD'),
            clientSecret: requireEnv('GOOGLE_CLIENT_SECRET_PROD'),
            redirectUri: requireEnv('GOOGLE_CLIENT_REDIRECT_URI_PROD'),
          },

  github:
    APP_ENV === 'local'
      ? {
          clientId: requireEnv('GITHUB_CLIENT_ID_LOCAL'),
          clientSecret: requireEnv('GITHUB_CLIENT_SECRET_LOCAL'),
          redirectUri: requireEnv('GITHUB_CLIENT_REDIRECT_URI_LOCAL'),
        }
      : APP_ENV === 'develop'
        ? {
            clientId: requireEnv('GITHUB_CLIENT_ID_DEVELOP'),
            clientSecret: requireEnv('GITHUB_CLIENT_SECRET_DEVELOP'),
            redirectUri: requireEnv('GITHUB_CLIENT_REDIRECT_URI_DEVELOP'),
          }
        : {
            clientId: requireEnv('GITHUB_CLIENT_ID_PROD'),
            clientSecret: requireEnv('GITHUB_CLIENT_SECRET_PROD'),
            redirectUri: requireEnv('GITHUB_CLIENT_REDIRECT_URI_PROD'),
          },
};

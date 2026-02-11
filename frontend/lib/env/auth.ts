type AppEnv = 'local' | 'develop' | 'production';
type OAuthProviderEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const validAppEnvs = ['local', 'develop', 'production'];
const rawAppEnv = process.env.APP_ENV;

if (!rawAppEnv) {
  throw new Error('APP_ENV is not defined');
}

if (!validAppEnvs.includes(rawAppEnv as AppEnv)) {
  throw new Error(
    `Invalid APP_ENV: ${rawAppEnv}. Must be one of: ${validAppEnvs.join(', ')}`
  );
}

const APP_ENV = rawAppEnv as AppEnv;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const authEnv = {
  appEnv: APP_ENV,

  get google(): OAuthProviderEnv {
    return {
      clientId: requireEnv('GOOGLE_CLIENT_ID'),
      clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
      redirectUri:
        APP_ENV === 'local'
          ? requireEnv('GOOGLE_CLIENT_REDIRECT_URI_LOCAL')
          : APP_ENV === 'develop'
            ? requireEnv('GOOGLE_CLIENT_REDIRECT_URI_DEVELOP')
            : requireEnv('GOOGLE_CLIENT_REDIRECT_URI_PROD'),
    };
  },

  get github(): OAuthProviderEnv {
    return APP_ENV === 'local'
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
          };
  },
};

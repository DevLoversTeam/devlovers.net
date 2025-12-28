type AppEnv = "local" | "develop" | "production";

const APP_ENV = process.env.APP_ENV as AppEnv | undefined;

if (!APP_ENV) {
  throw new Error("APP_ENV is not defined");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const env = {
  appEnv: APP_ENV,

  google: {
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri:
      APP_ENV === "local"
        ? requireEnv("GOOGLE_REDIRECT_URI_LOCAL")
        : APP_ENV === "develop"
        ? requireEnv("GOOGLE_REDIRECT_URI_DEVELOP")
        : requireEnv("GOOGLE_REDIRECT_URI_PROD"),
  },

  github:
    APP_ENV === "local"
      ? {
          clientId: requireEnv("GITHUB_CLIENT_ID_LOCAL"),
          clientSecret: requireEnv("GITHUB_CLIENT_SECRET_LOCAL"),
          redirectUri: requireEnv("GITHUB_REDIRECT_URI_LOCAL"),
        }
      : APP_ENV === "develop"
      ? {
          clientId: requireEnv("GITHUB_CLIENT_ID_DEVELOP"),
          clientSecret: requireEnv("GITHUB_CLIENT_SECRET_DEVELOP"),
          redirectUri: requireEnv("GITHUB_REDIRECT_URI_DEVELOP"),
        }
      : {
          clientId: requireEnv("GITHUB_CLIENT_ID_PROD"),
          clientSecret: requireEnv("GITHUB_CLIENT_SECRET_PROD"),
          redirectUri: requireEnv("GITHUB_REDIRECT_URI_PROD"),
        },
};
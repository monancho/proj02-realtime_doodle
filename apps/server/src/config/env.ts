import {
  REQUIRED_SERVER_ENV_KEYS,
  type RequiredServerEnvKey
} from "@doodle/shared";

export interface ServerEnv {
  NODE_ENV: string;
  PORT: string;
  CLIENT_URL: string;
  SOCKET_CORS_ORIGIN: string;
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
}

export interface EnvValidationResult {
  ok: boolean;
  env?: ServerEnv;
  missingKeys: RequiredServerEnvKey[];
}

export function validateServerEnv(
  source: Partial<Record<RequiredServerEnvKey, string | undefined>>
): EnvValidationResult {
  const missingKeys = REQUIRED_SERVER_ENV_KEYS.filter((key) => {
    const value = source[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missingKeys.length > 0) {
    return { ok: false, missingKeys };
  }

  return {
    ok: true,
    missingKeys: [],
    env: Object.fromEntries(
      REQUIRED_SERVER_ENV_KEYS.map((key) => [key, source[key]?.trim() ?? ""])
    ) as unknown as ServerEnv
  };
}

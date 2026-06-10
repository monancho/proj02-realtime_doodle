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
  AI_SERVER_BASE_URL: string;
  AI_SERVER_API_KEY: string;
  AI_SERVER_TIMEOUT_SECONDS: string;
}

export type EnvValidationResult =
  | {
      ok: true;
      env: ServerEnv;
      missingKeys: [];
    }
  | {
      ok: false;
      missingKeys: RequiredServerEnvKey[];
    };

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

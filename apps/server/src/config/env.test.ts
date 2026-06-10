import { describe, expect, it } from "vitest";

import { validateServerEnv } from "./env";

const validEnv = {
  NODE_ENV: "test",
  PORT: "4000",
  CLIENT_URL: "http://localhost:5173",
  SOCKET_CORS_ORIGIN: "http://localhost:5173",
  MONGODB_URI: "placeholder-uri",
  MONGODB_DB_NAME: "realtime-doodle-relay",
  FIREBASE_PROJECT_ID: "placeholder-project",
  FIREBASE_CLIENT_EMAIL: "placeholder@example.com",
  FIREBASE_PRIVATE_KEY: "placeholder-private-key",
  AI_SERVER_BASE_URL: "http://127.0.0.1:8000",
  AI_SERVER_API_KEY: "placeholder-ai-server-key",
  AI_SERVER_TIMEOUT_SECONDS: "20"
};

describe("validateServerEnv", () => {
  it("returns env when required keys are present", () => {
    const result = validateServerEnv(validEnv);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected env validation to pass");
    }

    expect(result.missingKeys).toEqual([]);
    expect(result.env.PORT).toBe("4000");
  });

  it("reports missing keys without exposing values", () => {
    const result = validateServerEnv({
      ...validEnv,
      MONGODB_URI: ""
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected env validation to fail");
    }

    expect(result.missingKeys).toEqual(["MONGODB_URI"]);
  });
});

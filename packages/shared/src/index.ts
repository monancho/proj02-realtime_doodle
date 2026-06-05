export const sharedPackageBoundary = {
  packageName: "@doodle/shared",
  responsibility: "API contracts, Socket event payload types, domain types, and validation contracts"
} as const;

export type { ApiErrorResponse, HealthResponse } from "./api";
export { REQUIRED_SERVER_ENV_KEYS } from "./env";
export type { RequiredServerEnvKey } from "./env";

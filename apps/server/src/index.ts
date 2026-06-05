export const serverAppBoundary = {
  packageName: "@doodle/server",
  responsibility: "Express, Socket.IO, Firebase Admin SDK, MongoDB, and GridFS server"
} as const;

export { handleHealthRequest, createHealthResponse } from "./health";
export type { HttpRequestLike, HttpResponseLike } from "./health";
export { validateServerEnv } from "./config/env";
export type { EnvValidationResult, ServerEnv } from "./config/env";

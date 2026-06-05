export const serverAppBoundary = {
  packageName: "@doodle/server",
  responsibility: "Express, Socket.IO, Firebase Admin SDK, MongoDB, and GridFS server"
} as const;

export {
  createFirebaseTokenVerifier,
  getFirebaseAdminApp,
  normalizePrivateKey
} from "./auth/firebase-admin";
export { createHttpAuthMiddleware } from "./auth/http";
export type { AuthenticatedRequest } from "./auth/http";
export { createSocketAuthMiddleware } from "./auth/socket";
export type { SocketNext } from "./auth/socket";
export { verifyAuthToken, extractBearerToken } from "./auth/tokens";
export type { TokenVerifier, VerifiedFirebaseToken } from "./auth/tokens";
export { createApp } from "./app";
export { connectMongoDb, createMongoClient } from "./db/mongodb";
export type { MongoDbConnection } from "./db/mongodb";
export { InMemoryUserRepository } from "./users/in-memory-user-repository";
export {
  createMongoUserRepository,
  ensureUserIndexes,
  MongoUserRepository
} from "./users/mongodb-user-repository";
export type {
  UserCollection,
  UserDocument
} from "./users/mongodb-user-repository";
export { createUserRouter } from "./users/routes";
export type { UserRepository, UpsertUserInput } from "./users/repository";
export { handleHealthRequest, createHealthResponse } from "./health";
export type { HttpRequestLike, HttpResponseLike } from "./health";
export { validateServerEnv } from "./config/env";
export type { EnvValidationResult, ServerEnv } from "./config/env";

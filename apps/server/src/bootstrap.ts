import type { Express } from "express";
import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";

import { createApp } from "./app";
import {
  createFirebaseTokenVerifier,
  getFirebaseAdminApp
} from "./auth/firebase-admin";
import { createHttpAuthMiddleware } from "./auth/http";
import type { TokenVerifier } from "./auth/tokens";
import {
  createMongoExpiredRoomCleanupStore
} from "./cleanup/mongodb-room-cleanup-store";
import {
  cleanupExpiredFinishedRooms,
  type ExpiredRoomCleanupStore,
  type RoomCleanupSummary
} from "./cleanup/room-cleanup";
import type { ServerEnv } from "./config/env";
import { connectMongoDb, type MongoDbConnection } from "./db/mongodb";
import {
  AiImageModerationClient,
  type ImageModerationClient
} from "./images/ai-image-moderation-client";
import { createGridFsImageStorage } from "./images/gridfs-image-storage";
import {
  createMongoImageRepository,
  ensureImageIndexes,
  type ImageDocument
} from "./images/mongodb-image-repository";
import type { ImageRepository } from "./images/repository";
import type { ImageStorage } from "./images/storage";
import { createGridFsResultImageStorage } from "./results/gridfs-result-storage";
import {
  createMongoResultRepository,
  ensureResultIndexes,
  type ResultDocument
} from "./results/mongodb-result-repository";
import type { ResultRepository } from "./results/repository";
import type { ResultImageStorage } from "./results/storage";
import { SocketRoomUpdatePublisher } from "./rooms/broadcast";
import {
  createMongoRoomRepository,
  ensureRoomIndexes,
  type RoomDocument
} from "./rooms/mongodb-room-repository";
import type { RoomRepository } from "./rooms/repository";
import {
  createMongoUserRepository,
  ensureUserIndexes,
  type UserDocument
} from "./users/mongodb-user-repository";
import type { UserRepository } from "./users/repository";

export interface ServerDependencies {
  app: Express;
  imageRepository: ImageRepository;
  imageStorage: ImageStorage;
  mongoConnection: MongoDbConnection;
  resultRepository: ResultRepository;
  resultStorage: ResultImageStorage;
  roomRepository: RoomRepository;
  roomUpdatePublisher: SocketRoomUpdatePublisher;
  tokenVerifier: TokenVerifier;
  userRepository: UserRepository;
}

export interface BootstrapAdapters {
  connectDb?: typeof connectMongoDb;
  createVerifier?: (env: ServerEnv) => TokenVerifier;
  createUserRepository?: (
    connection: MongoDbConnection
  ) => Promise<UserRepository>;
  createRoomRepository?: (
    connection: MongoDbConnection
  ) => Promise<RoomRepository>;
  createImageRepository?: (
    connection: MongoDbConnection
  ) => Promise<ImageRepository>;
  createImageModerationClient?: (env: ServerEnv) => ImageModerationClient;
  createImageStorage?: (connection: MongoDbConnection) => ImageStorage;
  createResultRepository?: (
    connection: MongoDbConnection
  ) => Promise<ResultRepository>;
  createResultStorage?: (connection: MongoDbConnection) => ResultImageStorage;
  createRoomCleanupStore?: (
    connection: MongoDbConnection
  ) => Promise<ExpiredRoomCleanupStore>;
  runRoomCleanup?: (input: {
    imageStorage: ImageStorage;
    resultStorage: ResultImageStorage;
    store: ExpiredRoomCleanupStore;
  }) => Promise<RoomCleanupSummary>;
}

export async function createServerDependencies(
  env: ServerEnv,
  adapters: BootstrapAdapters = {}
): Promise<ServerDependencies> {
  const tokenVerifier =
    adapters.createVerifier?.(env) ?? createDefaultFirebaseVerifier(env);
  const mongoConnection = await (adapters.connectDb ?? connectMongoDb)(env);
  const userRepository =
    (await adapters.createUserRepository?.(mongoConnection)) ??
    (await createDefaultUserRepository(mongoConnection));
  const roomRepository =
    (await adapters.createRoomRepository?.(mongoConnection)) ??
    (await createDefaultRoomRepository(mongoConnection));
  const imageRepository =
    (await adapters.createImageRepository?.(mongoConnection)) ??
    (await createDefaultImageRepository(mongoConnection));
  const imageStorage =
    adapters.createImageStorage?.(mongoConnection) ??
    createDefaultImageStorage(mongoConnection);
  const imageModerationClient =
    adapters.createImageModerationClient?.(env) ??
    new AiImageModerationClient(env);
  const resultRepository =
    (await adapters.createResultRepository?.(mongoConnection)) ??
    (await createDefaultResultRepository(mongoConnection));
  const resultStorage =
    adapters.createResultStorage?.(mongoConnection) ??
    createDefaultResultStorage(mongoConnection);
  const roomCleanupStore =
    (await adapters.createRoomCleanupStore?.(mongoConnection)) ??
    createDefaultRoomCleanupStore(mongoConnection);
  await runRoomCleanupOnBoot({
    imageStorage,
    resultStorage,
    runRoomCleanup: adapters.runRoomCleanup,
    store: roomCleanupStore
  });
  const roomUpdatePublisher = new SocketRoomUpdatePublisher();

  return {
    imageRepository,
    imageStorage,
    mongoConnection,
    resultRepository,
    resultStorage,
    roomRepository,
    roomUpdatePublisher,
    tokenVerifier,
    userRepository,
    app: createApp({
      allowLocalhostDevOrigins: env.NODE_ENV !== "production",
      authMiddleware: createHttpAuthMiddleware(tokenVerifier),
      corsOrigin: env.CLIENT_URL,
      imageModerationClient,
      imageRepository,
      imageStorage,
      resultRepository,
      resultStorage,
      roomRepository,
      roomUpdatePublisher,
      staticFrontendRoot: resolveStaticFrontendRoot(env.NODE_ENV),
      userRepository
    })
  };
}

export function resolveStaticFrontendRoot(
  nodeEnv: string,
  cwd = process.cwd()
): string | undefined {
  const candidatePaths = [
    join(cwd, "apps", "web", "dist"),
    join(cwd, "..", "web", "dist"),
    join(cwd, "..", "..", "apps", "web", "dist")
  ];
  const existingPath = candidatePaths.find((candidatePath) =>
    existsSync(candidatePath)
  );

  if (existingPath) {
    return existingPath;
  }

  return nodeEnv === "production" ? candidatePaths[0] : undefined;
}

export async function startHttpServer(
  app: Express,
  port: number
): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}

function createDefaultFirebaseVerifier(env: ServerEnv): TokenVerifier {
  return createFirebaseTokenVerifier(getFirebaseAdminApp(env));
}

async function createDefaultUserRepository(
  connection: MongoDbConnection
): Promise<UserRepository> {
  const users = connection.db.collection<UserDocument>("users");

  await ensureUserIndexes(users);

  return createMongoUserRepository(users);
}

async function createDefaultRoomRepository(
  connection: MongoDbConnection
): Promise<RoomRepository> {
  const rooms = connection.db.collection<RoomDocument>("rooms");

  await ensureRoomIndexes(rooms);

  return createMongoRoomRepository(rooms);
}

async function createDefaultImageRepository(
  connection: MongoDbConnection
): Promise<ImageRepository> {
  const images = connection.db.collection<ImageDocument>("images");

  await ensureImageIndexes(images);

  return createMongoImageRepository(images);
}

function createDefaultImageStorage(
  connection: MongoDbConnection
): ImageStorage {
  return createGridFsImageStorage(connection.db);
}

async function createDefaultResultRepository(
  connection: MongoDbConnection
): Promise<ResultRepository> {
  const results = connection.db.collection<ResultDocument>("results");

  await ensureResultIndexes(results);

  return createMongoResultRepository(results);
}

function createDefaultResultStorage(
  connection: MongoDbConnection
): ResultImageStorage {
  return createGridFsResultImageStorage(connection.db);
}

function createDefaultRoomCleanupStore(
  connection: MongoDbConnection
): ExpiredRoomCleanupStore {
  return createMongoExpiredRoomCleanupStore({
    images: connection.db.collection<ImageDocument>("images"),
    results: connection.db.collection<ResultDocument>("results"),
    rooms: connection.db.collection<RoomDocument>("rooms")
  });
}

async function runRoomCleanupOnBoot(input: {
  imageStorage: ImageStorage;
  resultStorage: ResultImageStorage;
  runRoomCleanup?: (cleanupInput: {
    imageStorage: ImageStorage;
    resultStorage: ResultImageStorage;
    store: ExpiredRoomCleanupStore;
  }) => Promise<RoomCleanupSummary>;
  store: ExpiredRoomCleanupStore;
}): Promise<void> {
  try {
    const summary = await (input.runRoomCleanup ?? cleanupExpiredFinishedRooms)({
      imageStorage: input.imageStorage,
      resultStorage: input.resultStorage,
      store: input.store
    });

    if (summary.roomsMatched > 0) {
      console.info("room cleanup completed", {
        failedOriginalFiles: summary.failedOriginalFiles,
        failedResultFiles: summary.failedResultFiles,
        imageMetadataDeleted: summary.imageMetadataDeleted,
        originalFilesDeleted: summary.originalFilesDeleted,
        resultFilesDeleted: summary.resultFilesDeleted,
        resultMetadataDeleted: summary.resultMetadataDeleted,
        roomsDeleted: summary.roomsDeleted,
        roomsMatched: summary.roomsMatched
      });
    }
  } catch {
    console.warn("room cleanup failed; continuing server startup");
  }
}

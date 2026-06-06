import type { Express } from "express";
import type { Server } from "node:http";

import { createApp } from "./app";
import {
  createFirebaseTokenVerifier,
  getFirebaseAdminApp
} from "./auth/firebase-admin";
import { createHttpAuthMiddleware } from "./auth/http";
import type { TokenVerifier } from "./auth/tokens";
import type { ServerEnv } from "./config/env";
import { connectMongoDb, type MongoDbConnection } from "./db/mongodb";
import { createGridFsImageStorage } from "./images/gridfs-image-storage";
import {
  createMongoImageRepository,
  ensureImageIndexes,
  type ImageDocument
} from "./images/mongodb-image-repository";
import type { ImageRepository } from "./images/repository";
import type { ImageStorage } from "./images/storage";
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
  roomRepository: RoomRepository;
  tokenVerifier: TokenVerifier;
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
  createImageStorage?: (connection: MongoDbConnection) => ImageStorage;
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

  return {
    imageRepository,
    imageStorage,
    mongoConnection,
    roomRepository,
    tokenVerifier,
    app: createApp({
      authMiddleware: createHttpAuthMiddleware(tokenVerifier),
      imageRepository,
      imageStorage,
      roomRepository,
      userRepository
    })
  };
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

import type { AuthErrorResponse } from "@doodle/shared";
import express, { type Express, type RequestHandler } from "express";

import { handleHealthRequest } from "./health";
import {
  createAllowedCorsOrigins,
  createHttpCorsMiddleware
} from "./http-cors";
import { InMemoryImageRepository } from "./images/in-memory-image-repository";
import { InMemoryImageStorage } from "./images/in-memory-image-storage";
import type { ImageRepository } from "./images/repository";
import {
  createImageBinaryRouter,
  createRoomImageRouter
} from "./images/routes";
import type { ImageStorage } from "./images/storage";
import { InMemoryResultRepository } from "./results/in-memory-result-repository";
import { InMemoryResultImageStorage } from "./results/in-memory-result-storage";
import type { ResultRepository } from "./results/repository";
import {
  createResultBinaryRouter,
  createRoomResultRouter
} from "./results/routes";
import type { ResultImageStorage } from "./results/storage";
import { InMemoryRoomRepository } from "./rooms/in-memory-room-repository";
import type { RoomRepository } from "./rooms/repository";
import { createRoomRouter } from "./rooms/routes";
import { InMemoryUserRepository } from "./users/in-memory-user-repository";
import type { UserRepository } from "./users/repository";
import { createUserRouter } from "./users/routes";

export interface AppDependencies {
  allowLocalhostDevOrigins?: boolean;
  authMiddleware?: RequestHandler;
  corsOrigin?: string;
  imageRepository?: ImageRepository;
  imageStorage?: ImageStorage;
  resultRepository?: ResultRepository;
  resultStorage?: ResultImageStorage;
  roomRepository?: RoomRepository;
  userRepository?: UserRepository;
}

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();

  app.disable("x-powered-by");
  if (dependencies.corsOrigin) {
    app.use(
      createHttpCorsMiddleware({
        allowLocalhostDevOrigins: dependencies.allowLocalhostDevOrigins,
        origins: createAllowedCorsOrigins(dependencies.corsOrigin)
      })
    );
  }
  app.use(express.json());

  app.get("/health", (_request, response) => {
    const healthResponse = handleHealthRequest({
      method: "GET",
      path: "/health"
    });

    response
      .status(healthResponse.statusCode)
      .set(healthResponse.headers)
      .json(healthResponse.body);
  });

  const authMiddleware =
    dependencies.authMiddleware ?? createMissingAuthMiddleware();
  const roomRepository =
    dependencies.roomRepository ?? new InMemoryRoomRepository();
  const imageRepository =
    dependencies.imageRepository ?? new InMemoryImageRepository();
  const imageStorage = dependencies.imageStorage ?? new InMemoryImageStorage();
  const resultRepository =
    dependencies.resultRepository ?? new InMemoryResultRepository();
  const resultStorage =
    dependencies.resultStorage ?? new InMemoryResultImageStorage();

  app.use(
    "/api/users",
    createUserRouter({
      authMiddleware,
      repository:
        dependencies.userRepository ?? new InMemoryUserRepository()
    })
  );

  app.use(
    "/api/rooms/:roomCode/images",
    createRoomImageRouter({
      authMiddleware,
      imageRepository,
      imageStorage,
      roomRepository
    })
  );

  app.use(
    "/api/images",
    createImageBinaryRouter({
      authMiddleware,
      imageRepository,
      imageStorage,
      roomRepository
    })
  );

  app.use(
    "/api/rooms/:roomCode/results",
    createRoomResultRouter({
      authMiddleware,
      resultRepository,
      resultStorage,
      roomRepository
    })
  );

  app.use(
    "/api/results",
    createResultBinaryRouter({
      authMiddleware,
      resultRepository,
      resultStorage,
      roomRepository
    })
  );

  app.use(
    "/api/rooms",
    createRoomRouter({
      authMiddleware,
      repository: roomRepository
    })
  );

  return app;
}

function createMissingAuthMiddleware(): RequestHandler {
  return (_request, response) => {
    const payload: AuthErrorResponse = {
      error: {
        code: "AUTH_TOKEN_MISSING",
        message: "Authentication middleware is not configured."
      }
    };

    response.status(401).json(payload);
  };
}

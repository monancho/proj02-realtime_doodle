import { existsSync } from "node:fs";
import { join } from "node:path";

import type { AuthErrorResponse } from "@doodle/shared";
import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler
} from "express";

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
import type { RoomUpdatePublisher } from "./rooms/broadcast";
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
  roomUpdatePublisher?: RoomUpdatePublisher;
  staticFrontendRoot?: string;
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
  const userRepository =
    dependencies.userRepository ?? new InMemoryUserRepository();

  app.use(
    "/api/users",
    createUserRouter({
      authMiddleware,
      repository: userRepository
    })
  );

  app.use(
    "/api/rooms/:roomCode/images",
    createRoomImageRouter({
      authMiddleware,
      imageRepository,
      imageStorage,
      roomUpdatePublisher: dependencies.roomUpdatePublisher,
      roomRepository,
      userRepository
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
      repository: roomRepository,
      userRepository
    })
  );

  mountStaticFrontend(app, dependencies.staticFrontendRoot);

  app.use(createSafeErrorHandler());

  return app;
}

function mountStaticFrontend(app: Express, staticFrontendRoot?: string): void {
  if (!staticFrontendRoot || !existsSync(staticFrontendRoot)) {
    return;
  }

  const indexPath = join(staticFrontendRoot, "index.html");

  if (!existsSync(indexPath)) {
    return;
  }

  app.use(express.static(staticFrontendRoot));
  app.use((request: Request, response, next: NextFunction) => {
    if (!shouldServeFrontendFallback(request)) {
      next();
      return;
    }

    response.sendFile(indexPath);
  });
}

function shouldServeFrontendFallback(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  if (request.path === "/health") {
    return false;
  }

  if (
    request.path.startsWith("/api/") ||
    request.path === "/api" ||
    request.path.startsWith("/socket.io/") ||
    request.path === "/socket.io"
  ) {
    return false;
  }

  return Boolean(request.accepts("html"));
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

function createSafeErrorHandler(): ErrorRequestHandler {
  return (_error, _request, response, _next) => {
    if (response.headersSent) {
      response.end();
      return;
    }

    response.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error."
      }
    });
  };
}

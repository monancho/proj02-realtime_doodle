import type { AuthErrorResponse } from "@doodle/shared";
import express, { type Express, type RequestHandler } from "express";

import { handleHealthRequest } from "./health";
import { InMemoryUserRepository } from "./users/in-memory-user-repository";
import type { UserRepository } from "./users/repository";
import { createUserRouter } from "./users/routes";

export interface AppDependencies {
  authMiddleware?: RequestHandler;
  userRepository?: UserRepository;
}

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();

  app.disable("x-powered-by");
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

  app.use(
    "/api/users",
    createUserRouter({
      authMiddleware:
        dependencies.authMiddleware ?? createMissingAuthMiddleware(),
      repository:
        dependencies.userRepository ?? new InMemoryUserRepository()
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

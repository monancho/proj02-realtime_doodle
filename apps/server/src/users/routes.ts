import type {
  AuthErrorResponse,
  UpsertMeRequest,
  UpsertMeResponse
} from "@doodle/shared";
import { Router, type RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/http";
import type { UserRepository } from "./repository";

export interface UserRouterDependencies {
  authMiddleware: RequestHandler;
  repository: UserRepository;
}

export function createUserRouter({
  authMiddleware,
  repository
}: UserRouterDependencies): Router {
  const router = Router();

  router.post("/me", authMiddleware, async (request, response, next) => {
    try {
      const authenticatedRequest = request as AuthenticatedRequest;

      if (!authenticatedRequest.auth) {
        response.status(401).json(createMissingAuthResponse());
        return;
      }

      const body = parseUpsertMeRequest(request.body);
      const authUser = authenticatedRequest.auth.user;
      const user = await repository.upsertByFirebaseUid({
        firebaseUid: authUser.firebaseUid,
        email: authUser.email,
        nickname: body.nickname ?? authUser.nickname,
        avatarUrl: body.avatarUrl ?? authUser.avatarUrl
      });
      const payload: UpsertMeResponse = { user };

      response.status(200).json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseUpsertMeRequest(value: unknown): UpsertMeRequest {
  if (!value || typeof value !== "object") {
    return {};
  }

  const candidate = value as Record<string, unknown>;

  return {
    nickname: normalizeOptionalString(candidate.nickname),
    avatarUrl: normalizeOptionalString(candidate.avatarUrl)
  };
}

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function createMissingAuthResponse(): AuthErrorResponse {
  return {
    error: {
      code: "AUTH_TOKEN_MISSING",
      message: "Authentication is required."
    }
  };
}

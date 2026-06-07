import type {
  AuthErrorResponse,
  UpsertMeRequest,
  UpsertMeResponse
} from "@doodle/shared";
import { Router, type RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/http";
import type { UserRepository } from "./repository";

const MIN_NICKNAME_LENGTH = 2;
const MAX_NICKNAME_LENGTH = 12;
const NICKNAME_PATTERN = /^[\p{L}\p{N} ]+$/u;

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
      const existingUser = await repository.findByFirebaseUid(authUser.firebaseUid);
      const profileInput = await resolveProfileInput({
        body,
        existingUser,
        firebaseUid: authUser.firebaseUid,
        fallbackAvatarUrl: authUser.avatarUrl,
        repository
      });
      const user = await repository.upsertByFirebaseUid({
        firebaseUid: authUser.firebaseUid,
        email: authUser.email,
        nickname: profileInput.nickname,
        nicknameNormalized: profileInput.nicknameNormalized,
        avatarUrl: profileInput.avatarUrl,
        profileSetupCompletedAt: profileInput.profileSetupCompletedAt
      });
      const payload: UpsertMeResponse = { user };

      response.status(200).json(payload);
    } catch (error) {
      sendUserErrorOrNext(error, response, next);
    }
  });

  return router;
}

interface ResolveProfileInputOptions {
  body: UpsertMeRequest;
  existingUser: Awaited<ReturnType<UserRepository["findByFirebaseUid"]>>;
  firebaseUid: string;
  fallbackAvatarUrl: string | null;
  repository: UserRepository;
}

interface ResolvedProfileInput {
  nickname: string | null;
  nicknameNormalized: string | null;
  avatarUrl: string | null;
  profileSetupCompletedAt: string | null;
}

class UserRequestError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "UserRequestError";
  }
}

async function resolveProfileInput({
  body,
  existingUser,
  firebaseUid,
  fallbackAvatarUrl,
  repository
}: ResolveProfileInputOptions): Promise<ResolvedProfileInput> {
  const nickname =
    body.nickname === undefined
      ? existingUser?.nickname ?? null
      : validateNickname(body.nickname);
  const nicknameNormalized = nickname ? normalizeNickname(nickname) : null;

  if (nicknameNormalized) {
    const duplicate = await repository.findByNicknameNormalized(nicknameNormalized);

    if (duplicate && duplicate.firebaseUid !== firebaseUid) {
      throw new UserRequestError(
        "USER_NICKNAME_DUPLICATE",
        409,
        "Nickname is already in use."
      );
    }
  }

  const profileSetupCompletedAt = nickname
    ? existingUser?.profileSetupCompletedAt ?? new Date().toISOString()
    : null;
  const avatarUrl =
    body.avatarUrl === undefined
      ? existingUser?.avatarUrl ?? fallbackAvatarUrl
      : validateAvatarUrl(body.avatarUrl);

  return {
    nickname,
    nicknameNormalized,
    avatarUrl,
    profileSetupCompletedAt
  };
}

function validateNickname(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    throw new UserRequestError(
      "USER_NICKNAME_REQUIRED",
      400,
      "Nickname is required."
    );
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  if (trimmed.length < MIN_NICKNAME_LENGTH || trimmed.length > MAX_NICKNAME_LENGTH) {
    throw new UserRequestError(
      "USER_NICKNAME_INVALID",
      400,
      "Nickname must be between 2 and 12 characters."
    );
  }

  if (!NICKNAME_PATTERN.test(trimmed)) {
    throw new UserRequestError(
      "USER_NICKNAME_INVALID",
      400,
      "Nickname contains unsupported characters."
    );
  }

  return trimmed;
}

function normalizeNickname(nickname: string): string {
  return nickname.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function validateAvatarUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }

    return url.toString();
  } catch {
    throw new UserRequestError(
      "USER_AVATAR_URL_INVALID",
      400,
      "Avatar URL must be a valid https URL."
    );
  }
}

function parseUpsertMeRequest(value: unknown): UpsertMeRequest {
  if (!value || typeof value !== "object") {
    return {};
  }

  const candidate = value as Record<string, unknown>;

  return {
    nickname: parseOptionalString(candidate.nickname),
    avatarUrl: parseOptionalString(candidate.avatarUrl)
  };
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed;
}

function sendUserErrorOrNext(
  error: unknown,
  response: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2]
): void {
  if (error instanceof UserRequestError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  next(error);
}

function createMissingAuthResponse(): AuthErrorResponse {
  return {
    error: {
      code: "AUTH_TOKEN_MISSING",
      message: "Authentication is required."
    }
  };
}

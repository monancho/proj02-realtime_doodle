import type {
  ApiErrorResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  GetRoomResponse,
  JoinRoomResponse,
  RoomSettings
} from "@doodle/shared";
import { Router, type RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/http";
import { getRoomErrorHttpStatus, RoomDomainError } from "./errors";
import type { RoomRepository } from "./repository";
import type { UserRepository } from "../users/repository";

const DEFAULT_ROOM_TITLE = "Untitled Room";
const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  roundDurationSec: 60,
  maxPlayers: 4,
  maxImagesPerUser: 1
};
const MAX_ROOM_PLAYERS = 4;

export interface RoomRouterDependencies {
  authMiddleware: RequestHandler;
  repository: RoomRepository;
  userRepository: UserRepository;
}

export function createRoomRouter({
  authMiddleware,
  repository,
  userRepository
}: RoomRouterDependencies): Router {
  const router = Router();

  router.post("/", authMiddleware, async (request, response, next) => {
    try {
      const authenticatedRequest = request as AuthenticatedRequest;

      if (!authenticatedRequest.auth) {
        response.status(401).json(createMissingAuthResponse());
        return;
      }

      const body = parseCreateRoomRequest(request.body);
      const authUser = authenticatedRequest.auth.user;
      const participantProfile = await getStoredParticipantProfile(
        userRepository,
        authUser.firebaseUid
      );
      const room = await repository.createRoom({
        host: {
          firebaseUid: authUser.firebaseUid,
          nickname: participantProfile.nickname,
          avatarUrl: participantProfile.avatarUrl
        },
        title: body.title ?? DEFAULT_ROOM_TITLE,
        settings: {
          ...DEFAULT_ROOM_SETTINGS,
          ...body.settings
        }
      });
      const payload: CreateRoomResponse = { room };

      response.status(201).json(payload);
    } catch (error) {
      sendRoomErrorOrNext(error, response, next);
    }
  });

  router.get("/:roomCode", authMiddleware, async (request, response, next) => {
    try {
      const authenticatedRequest = request as AuthenticatedRequest;

      if (!authenticatedRequest.auth) {
        response.status(401).json(createMissingAuthResponse());
        return;
      }

      const roomCode = getRouteParam(request.params.roomCode);
      const room = await repository.findRoomByCode(roomCode);

      if (!room) {
        response.status(404).json(createApiError("ROOM_NOT_FOUND", "Room was not found."));
        return;
      }

      const payload: GetRoomResponse = { room };

      response.status(200).json(payload);
    } catch (error) {
      sendRoomErrorOrNext(error, response, next);
    }
  });

  router.post(
    "/:roomCode/join",
    authMiddleware,
    async (request, response, next) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest;

        if (!authenticatedRequest.auth) {
          response.status(401).json(createMissingAuthResponse());
          return;
        }

        const authUser = authenticatedRequest.auth.user;
        const participantProfile = await getStoredParticipantProfile(
          userRepository,
          authUser.firebaseUid
        );
        const room = await repository.joinRoom({
          roomCode: getRouteParam(request.params.roomCode),
          participant: {
            firebaseUid: authUser.firebaseUid,
            nickname: participantProfile.nickname,
            avatarUrl: participantProfile.avatarUrl
          }
        });
        const payload: JoinRoomResponse = { room };

        response.status(200).json(payload);
      } catch (error) {
        sendRoomErrorOrNext(error, response, next);
      }
    }
  );

  return router;
}

async function getStoredParticipantProfile(
  userRepository: UserRepository,
  firebaseUid: string
): Promise<{ nickname: string | null; avatarUrl: string | null }> {
  const profile = await userRepository.findByFirebaseUid(firebaseUid);

  return {
    nickname: profile?.nickname ?? null,
    avatarUrl: profile?.avatarUrl ?? null
  };
}

function parseCreateRoomRequest(value: unknown): CreateRoomRequest {
  if (!value || typeof value !== "object") {
    return {};
  }

  const candidate = value as Record<string, unknown>;

  return {
    title: normalizeOptionalString(candidate.title),
    settings: parseRoomSettings(candidate.settings)
  };
}

function parseRoomSettings(value: unknown): Partial<RoomSettings> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const settings: Partial<RoomSettings> = {};
  const roundDurationSec = normalizePositiveInteger(candidate.roundDurationSec);
  const maxPlayers = normalizePositiveInteger(candidate.maxPlayers);
  const maxImagesPerUser = normalizePositiveInteger(candidate.maxImagesPerUser);

  if (roundDurationSec !== undefined) {
    settings.roundDurationSec = roundDurationSec;
  }
  if (maxPlayers !== undefined) {
    settings.maxPlayers = Math.min(maxPlayers, MAX_ROOM_PLAYERS);
  }
  if (maxImagesPerUser !== undefined) {
    settings.maxImagesPerUser = maxImagesPerUser;
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
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

function getRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function sendRoomErrorOrNext(
  error: unknown,
  response: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2]
): void {
  if (error instanceof RoomDomainError) {
    response
      .status(getRoomErrorHttpStatus(error.code))
      .json(createApiError(error.code, error.message));
    return;
  }

  next(error);
}

function createMissingAuthResponse(): ApiErrorResponse {
  return createApiError("AUTH_TOKEN_MISSING", "Authentication is required.");
}

function createApiError(code: string, message: string): ApiErrorResponse {
  return {
    error: {
      code,
      message
    }
  };
}

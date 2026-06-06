import type { ApiErrorResponse, ListRoomResultsResponse } from "@doodle/shared";
import { Router, type RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/http";
import type { RoomRepository } from "../rooms/repository";
import { normalizeRoomCode } from "../rooms/room-code";
import {
  getResultErrorHttpStatus,
  ResultDomainError
} from "./errors";
import type {
  ResultPaginationCursor,
  ResultRepository
} from "./repository";
import type { ResultImageStorage } from "./storage";

const DEFAULT_RESULT_PAGE_LIMIT = 20;
const MAX_RESULT_PAGE_LIMIT = 50;

export interface ResultRouterDependencies {
  authMiddleware: RequestHandler;
  resultRepository: ResultRepository;
  resultStorage: ResultImageStorage;
  roomRepository: RoomRepository;
}

export function createRoomResultRouter({
  authMiddleware,
  resultRepository,
  roomRepository
}: ResultRouterDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", authMiddleware, async (request, response, next) => {
    try {
      const authenticatedRequest = request as AuthenticatedRequest;
      const auth = authenticatedRequest.auth;

      if (!auth) {
        response.status(401).json(createMissingAuthResponse());
        return;
      }

      const roomCode = getRouteParam(request.params.roomCode);
      const room = await getReadableRoom(
        roomRepository,
        roomCode,
        auth.user.firebaseUid
      );
      const pageRequest = parsePageRequest(request.query);
      const page = await resultRepository.listResultsByRoomCode({
        roomCode: room.roomCode,
        limit: pageRequest.limit,
        cursor: pageRequest.cursor
      });
      const payload: ListRoomResultsResponse = {
        results: page.results,
        page: {
          limit: pageRequest.limit,
          cursor: pageRequest.rawCursor,
          nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null
        }
      };

      response.status(200).json(payload);
    } catch (error) {
      sendResultErrorOrNext(error, response, next);
    }
  });

  return router;
}

export function createResultBinaryRouter({
  authMiddleware,
  resultRepository,
  resultStorage,
  roomRepository
}: ResultRouterDependencies): Router {
  const router = Router();

  router.get(
    "/:resultId/download",
    authMiddleware,
    async (request, response, next) => {
      try {
        const authenticatedRequest = request as AuthenticatedRequest;
        const auth = authenticatedRequest.auth;

        if (!auth) {
          response.status(401).json(createMissingAuthResponse());
          return;
        }

        const result = await resultRepository.findResultById(
          getRouteParam(request.params.resultId)
        );

        if (!result) {
          throw new ResultDomainError(
            "RESULT_NOT_FOUND",
            "Result was not found."
          );
        }

        await getReadableRoom(
          roomRepository,
          result.roomCode,
          auth.user.firebaseUid
        );

        const file = await resultStorage.getResultImage(result.resultFileId);

        if (!file) {
          throw new ResultDomainError(
            "RESULT_FILE_NOT_FOUND",
            "Result image file was not found."
          );
        }

        response
          .status(200)
          .set("Content-Type", file.mimeType)
          .set("Content-Length", file.size.toString())
          .set(
            "Content-Disposition",
            `attachment; filename="${createDownloadFilename(result.roomCode, result.roundIndex)}"`
          )
          .set("Cache-Control", "private, max-age=0, no-cache");
        file.stream.pipe(response);
      } catch (error) {
        sendResultErrorOrNext(error, response, next);
      }
    }
  );

  return router;
}

async function getReadableRoom(
  repository: RoomRepository,
  roomCode: string,
  firebaseUid: string
) {
  const room = await repository.findRoomByCode(normalizeRoomCode(roomCode));

  if (!room) {
    throw new ResultDomainError("ROOM_NOT_FOUND", "Room was not found.");
  }

  const isParticipant = room.participants.some(
    (participant) => participant.firebaseUid === firebaseUid
  );

  if (!isParticipant) {
    throw new ResultDomainError(
      "ROOM_ACCESS_DENIED",
      "Join the room before accessing results."
    );
  }

  return room;
}

function parsePageRequest(query: {
  limit?: unknown;
  cursor?: unknown;
}): {
  limit: number;
  cursor: ResultPaginationCursor | null;
  rawCursor: string | null;
} {
  const limit = parseLimit(query.limit);
  const rawCursor = parseRawCursor(query.cursor);

  return {
    limit,
    rawCursor,
    cursor: rawCursor ? decodeCursor(rawCursor) : null
  };
}

function parseLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_RESULT_PAGE_LIMIT;
  }

  if (Array.isArray(value) || typeof value !== "string") {
    throw new ResultDomainError(
      "RESULT_QUERY_INVALID",
      "Result page limit is invalid."
    );
  }

  const limit = Number.parseInt(value, 10);

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_RESULT_PAGE_LIMIT ||
    limit.toString() !== value
  ) {
    throw new ResultDomainError(
      "RESULT_QUERY_INVALID",
      "Result page limit is invalid."
    );
  }

  return limit;
}

function parseRawCursor(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value) || typeof value !== "string") {
    throw new ResultDomainError(
      "RESULT_QUERY_INVALID",
      "Result page cursor is invalid."
    );
  }

  return value.length > 0 ? value : null;
}

function encodeCursor(cursor: ResultPaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(cursor: string): ResultPaginationCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as Partial<ResultPaginationCursor>;

    if (
      typeof parsed.createdAt !== "string" ||
      Number.isNaN(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0
    ) {
      throw new Error("Invalid cursor payload.");
    }

    return {
      createdAt: parsed.createdAt,
      id: parsed.id
    };
  } catch {
    throw new ResultDomainError(
      "RESULT_QUERY_INVALID",
      "Result page cursor is invalid."
    );
  }
}

function sendResultErrorOrNext(
  error: unknown,
  response: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2]
): void {
  if (error instanceof ResultDomainError) {
    response
      .status(getResultErrorHttpStatus(error.code))
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

function getRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function createDownloadFilename(roomCode: string, roundIndex: number): string {
  return `doodle-${normalizeRoomCode(roomCode)}-${roundIndex}.png`;
}


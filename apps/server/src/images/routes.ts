import type {
  ApiErrorResponse,
  ImageMimeType,
  ListRoomImagesResponse,
  UploadImageResponse
} from "@doodle/shared";
import { Router, type RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/http";
import type { RoomUpdatePublisher } from "../rooms/broadcast";
import type { RoomRepository } from "../rooms/repository";
import { normalizeRoomCode } from "../rooms/room-code";
import type { UserRepository } from "../users/repository";
import type { ImageModerationClient } from "./ai-image-moderation-client";
import { getImageErrorHttpStatus, ImageDomainError } from "./errors";
import { parseSingleImageMultipart } from "./multipart";
import type { ImageRepository } from "./repository";
import type { ImageStorage } from "./storage";

const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set<ImageMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export interface ImageRouterDependencies {
  authMiddleware: RequestHandler;
  imageModerationClient?: ImageModerationClient;
  imageRepository: ImageRepository;
  imageStorage: ImageStorage;
  roomUpdatePublisher?: RoomUpdatePublisher;
  roomRepository: RoomRepository;
  userRepository?: UserRepository;
}

export function createRoomImageRouter({
  authMiddleware,
  imageModerationClient,
  imageRepository,
  imageStorage,
  roomUpdatePublisher,
  roomRepository,
  userRepository
}: ImageRouterDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/", authMiddleware, async (request, response, next) => {
    try {
      const authenticatedRequest = request as AuthenticatedRequest;
      const auth = authenticatedRequest.auth;

      if (!auth) {
        response.status(401).json(createMissingAuthResponse());
        return;
      }

      const roomCode = getRouteParam(request.params.roomCode);
      const room = await getWritableRoom(roomRepository, roomCode, auth.user.firebaseUid);
      const existingUploadCount =
        await imageRepository.countImagesByUploader({
          roomCode: room.roomCode,
          firebaseUid: auth.user.firebaseUid
        });

      const multipartFile = await parseSingleImageMultipart(
        request,
        MAX_IMAGE_FILE_SIZE_BYTES
      );
      const mimeType = parseImageMimeType(multipartFile.mimeType);

      if (!mimeType) {
        throw new ImageDomainError(
          "IMAGE_FILE_TYPE_UNSUPPORTED",
          "Only JPEG, PNG, and WebP images are supported."
        );
      }

      if (multipartFile.buffer.byteLength === 0) {
        throw new ImageDomainError(
          "IMAGE_FILE_EMPTY",
          "Image file must not be empty."
        );
      }

      if (multipartFile.buffer.byteLength > MAX_IMAGE_FILE_SIZE_BYTES) {
        throw new ImageDomainError(
          "IMAGE_FILE_TOO_LARGE",
          "Image file must be 5MB or smaller."
        );
      }

      const moderationWarning = imageModerationClient
        ? await moderateUploadImage({
          client: imageModerationClient,
          filename: sanitizeOriginalName(multipartFile.filename),
          buffer: multipartFile.buffer,
          mimeType
        })
        : null;

      const storedFile = await imageStorage.storeFile({
        buffer: multipartFile.buffer,
        originalName: sanitizeOriginalName(multipartFile.filename),
        mimeType,
        metadata: {
          roomCode: room.roomCode,
          uploadedByFirebaseUid: auth.user.firebaseUid,
          createdAt: new Date().toISOString()
        }
      });

      try {
        const profile = await userRepository?.findByFirebaseUid(
          auth.user.firebaseUid
        );
        const image = await imageRepository.createImageMetadata({
          roomCode: room.roomCode,
          uploadedBy: {
            firebaseUid: auth.user.firebaseUid,
            nickname: profile?.nickname ?? auth.user.nickname,
            avatarUrl: profile?.avatarUrl ?? auth.user.avatarUrl
          },
          originalName: sanitizeOriginalName(multipartFile.filename),
          mimeType,
          size: multipartFile.buffer.byteLength,
          fileId: storedFile.fileId,
          width: null,
          height: null
        });
        if (existingUploadCount >= room.settings.maxImagesPerUser) {
          await imageRepository.deactivateActiveImagesByUploader({
            roomCode: room.roomCode,
            firebaseUid: auth.user.firebaseUid,
            exceptImageId: image.id
          });
        }
        const payload: UploadImageResponse = {
          image,
          ...(moderationWarning ? { warning: moderationWarning } : {})
        };

        roomUpdatePublisher?.publishRoomUpdated(room);
        response.status(201).json(payload);
      } catch (error) {
        await imageStorage.deleteFile(storedFile.fileId);
        throw error;
      }
    } catch (error) {
      sendImageErrorOrNext(error, response, next);
    }
  });

  router.get("/", authMiddleware, async (request, response, next) => {
    try {
      const authenticatedRequest = request as AuthenticatedRequest;
      const auth = authenticatedRequest.auth;

      if (!auth) {
        response.status(401).json(createMissingAuthResponse());
        return;
      }

      const roomCode = getRouteParam(request.params.roomCode);
      const room = await getReadableRoom(roomRepository, roomCode, auth.user.firebaseUid);
      const images = await imageRepository.listImagesByRoomCode(room.roomCode);
      const payload: ListRoomImagesResponse = { images };

      response.status(200).json(payload);
    } catch (error) {
      sendImageErrorOrNext(error, response, next);
    }
  });

  return router;
}

export function createImageBinaryRouter({
  authMiddleware,
  imageRepository,
  imageStorage,
  roomRepository
}: ImageRouterDependencies): Router {
  const router = Router();

  router.get("/:imageId", authMiddleware, async (request, response, next) => {
    try {
      const authenticatedRequest = request as AuthenticatedRequest;
      const auth = authenticatedRequest.auth;

      if (!auth) {
        response.status(401).json(createMissingAuthResponse());
        return;
      }

      const image = await imageRepository.findImageById(
        getRouteParam(request.params.imageId)
      );

      if (!image) {
        throw new ImageDomainError("IMAGE_NOT_FOUND", "Image was not found.");
      }

      await getReadableRoom(roomRepository, image.roomCode, auth.user.firebaseUid);

      const file = await imageStorage.getFile(image.fileId);

      if (!file) {
        throw new ImageDomainError("IMAGE_NOT_FOUND", "Image was not found.");
      }

      response
        .status(200)
        .set("Content-Type", file.mimeType)
        .set("Content-Length", file.size.toString())
        .set(
          "Content-Disposition",
          createInlineContentDisposition(file.originalName)
        );
      file.stream.pipe(response);
    } catch (error) {
      sendImageErrorOrNext(error, response, next);
    }
  });

  return router;
}

async function getWritableRoom(
  repository: RoomRepository,
  roomCode: string,
  firebaseUid: string
) {
  const room = await getReadableRoom(repository, roomCode, firebaseUid);

  if (room.status !== "waiting") {
    throw new ImageDomainError(
      "ROOM_STATE_INVALID",
      "Images can only be uploaded while the room is waiting."
    );
  }

  return room;
}

async function getReadableRoom(
  repository: RoomRepository,
  roomCode: string,
  firebaseUid: string
) {
  const room = await repository.findRoomByCode(normalizeRoomCode(roomCode));

  if (!room) {
    throw new ImageDomainError("ROOM_NOT_FOUND", "Room was not found.");
  }

  const isParticipant = room.participants.some(
    (participant) => participant.firebaseUid === firebaseUid
  );

  if (!isParticipant) {
    throw new ImageDomainError(
      "ROOM_ACCESS_DENIED",
      "Join the room before accessing images."
    );
  }

  return room;
}

function parseImageMimeType(value: string): ImageMimeType | null {
  if (ALLOWED_IMAGE_MIME_TYPES.has(value as ImageMimeType)) {
    return value as ImageMimeType;
  }

  return null;
}

async function moderateUploadImage(input: {
  client: ImageModerationClient;
  filename: string;
  buffer: Buffer;
  mimeType: ImageMimeType;
}): Promise<UploadImageResponse["warning"] | null> {
  let moderationResult;

  try {
    moderationResult = await input.client.moderate({
      buffer: input.buffer,
      filename: input.filename,
      mimeType: input.mimeType
    });
  } catch {
    throw new ImageDomainError(
      "IMAGE_MODERATION_FAILED",
      "Image safety check failed. Please try again later."
    );
  }

  if (moderationResult.action === "block") {
    throw new ImageDomainError(
      "IMAGE_MODERATION_BLOCKED",
      moderationResult.message ??
        "This image cannot be uploaded. Please choose a different image."
    );
  }

  if (moderationResult.action === "review") {
    return {
      code: "IMAGE_MODERATION_REVIEW_REQUIRED",
      message:
        moderationResult.message ??
        "This image may need review, but it can still be used."
    };
  }

  if (!moderationResult.allowed) {
    throw new ImageDomainError(
      "IMAGE_MODERATION_BLOCKED",
      moderationResult.message ??
        "This image cannot be uploaded. Please choose a different image."
    );
  }

  return null;
}

function sanitizeOriginalName(filename: string): string {
  const normalized = filename.replaceAll("\\", "/").split("/").pop()?.trim();

  return normalized && normalized.length > 0 ? normalized : "upload";
}

function getRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function sendImageErrorOrNext(
  error: unknown,
  response: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2]
): void {
  if (error instanceof ImageDomainError) {
    response
      .status(getImageErrorHttpStatus(error.code))
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

function createInlineContentDisposition(filename: string): string {
  const fallback = createAsciiFilenameFallback(filename);
  const encodedFilename = encodeRfc5987Value(filename);

  return `inline; filename="${fallback}"; filename*=UTF-8''${encodedFilename}`;
}

function createAsciiFilenameFallback(filename: string): string {
  const fallback = filename
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!fallback || fallback.length === 0) {
    return "image";
  }

  return fallback.startsWith(".") ? `image${fallback}` : fallback;
}

function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

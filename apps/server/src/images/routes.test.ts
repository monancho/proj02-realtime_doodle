import type { AuthContext, RoomDetail, RoomSettings } from "@doodle/shared";
import type { RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import type { AuthenticatedRequest } from "../auth/http";
import { InMemoryRoomRepository } from "../rooms/in-memory-room-repository";
import { InMemoryUserRepository } from "../users/in-memory-user-repository";
import { InMemoryImageRepository } from "./in-memory-image-repository";
import { InMemoryImageStorage } from "./in-memory-image-storage";

const roomSettings: RoomSettings = {
  roundDurationSec: 60,
  maxPlayers: 4,
  maxImagesPerUser: 1
};

const hostAuthContext: AuthContext = {
  user: {
    firebaseUid: "host-uid",
    email: "host@example.com",
    nickname: "Host",
    avatarUrl: "https://example.com/host.png"
  }
};

const guestAuthContext: AuthContext = {
  user: {
    firebaseUid: "guest-uid",
    email: "guest@example.com",
    nickname: "Guest",
    avatarUrl: null
  }
};

describe("image routes", () => {
  it("uploads image metadata and stores the original file", async () => {
    const { app, roomUpdatePublisher } =
      await createImageRouteTestApp(hostAuthContext);

    const response = await request(app)
      .post("/api/rooms/abc123/images")
      .attach("image", Buffer.from("png-bytes"), {
        filename: "doodle.png",
        contentType: "image/png"
      })
      .expect(201);

    expect(response.body.image).toMatchObject({
      id: "image-1",
      roomCode: "ABC123",
      uploadedBy: {
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: "https://example.com/host.png"
      },
      originalName: "doodle.png",
      mimeType: "image/png",
      size: 9,
      storageType: "gridfs",
      fileId: "file-1",
      width: null,
      height: null,
      used: false
    });
    expect(roomUpdatePublisher.publishRoomUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ roomCode: "ABC123" })
    );
  });

  it("uses the stored user profile for uploaded image metadata", async () => {
    const tokenAuthContext: AuthContext = {
      user: {
        firebaseUid: "host-uid",
        email: "host@example.com",
        nickname: "Google Real Name",
        avatarUrl: "https://example.com/google.png"
      }
    };
    const { app } = await createImageRouteTestApp(tokenAuthContext, undefined, {
      nickname: "Doodle Nick",
      avatarUrl: "https://example.com/doodle.png"
    });

    const response = await request(app)
      .post("/api/rooms/abc123/images")
      .attach("image", Buffer.from("png-bytes"), {
        filename: "doodle.png",
        contentType: "image/png"
      })
      .expect(201);

    expect(response.body.image.uploadedBy).toMatchObject({
      firebaseUid: "host-uid",
      nickname: "Doodle Nick",
      avatarUrl: "https://example.com/doodle.png"
    });
  });

  it("lists room image metadata for participants", async () => {
    const { app } = await createImageRouteTestApp(hostAuthContext);

    await request(app)
      .post("/api/rooms/abc123/images")
      .attach("image", Buffer.from("jpeg-bytes"), {
        filename: "first.jpg",
        contentType: "image/jpeg"
      })
      .expect(201);

    const response = await request(app)
      .get("/api/rooms/ABC123/images")
      .expect(200);

    expect(response.body.images).toHaveLength(1);
    expect(response.body.images[0]).toMatchObject({
      originalName: "first.jpg",
      mimeType: "image/jpeg"
    });
  });

  it("streams original images from in-memory storage", async () => {
    const { app } = await createImageRouteTestApp(hostAuthContext);
    await request(app)
      .post("/api/rooms/abc123/images")
      .attach("image", Buffer.from("webp-bytes"), {
        filename: "drawing.webp",
        contentType: "image/webp"
      })
      .expect(201);

    const response = await request(app).get("/api/images/image-1").expect(200);

    expect(response.headers["content-type"]).toBe("image/webp");
    expect(Buffer.from(response.body).toString("utf8")).toBe("webp-bytes");
  });

  it("streams images with safe content-disposition for non-ascii filenames", async () => {
    const { app } = await createImageRouteTestApp(hostAuthContext);
    await request(app)
      .post("/api/rooms/abc123/images")
      .attach("image", Buffer.from("png-bytes"), {
        filename: "테스트 사진.png",
        contentType: "image/png"
      })
      .expect(201);

    const response = await request(app).get("/api/images/image-1").expect(200);

    expect(response.headers["content-disposition"]).toContain(
      'inline; filename="image.png"'
    );
    expect(response.headers["content-disposition"]).toContain(
      "filename*=UTF-8''%ED%85%8C%EC%8A%A4%ED%8A%B8%20%EC%82%AC%EC%A7%84.png"
    );
  });

  it("rejects uploads from non-participants", async () => {
    const { app } = await createImageRouteTestApp(guestAuthContext);

    const response = await request(app)
      .post("/api/rooms/ABC123/images")
      .attach("image", Buffer.from("png-bytes"), {
        filename: "doodle.png",
        contentType: "image/png"
      })
      .expect(403);

    expect(response.body.error.code).toBe("ROOM_ACCESS_DENIED");
  });

  it("rejects uploads when the room is not waiting", async () => {
    const room = createRoomDetail({ status: "playing" });
    const { app } = await createImageRouteTestApp(hostAuthContext, [room]);

    const response = await request(app)
      .post("/api/rooms/ABC123/images")
      .attach("image", Buffer.from("png-bytes"), {
        filename: "doodle.png",
        contentType: "image/png"
      })
      .expect(409);

    expect(response.body.error.code).toBe("ROOM_STATE_INVALID");
  });

  it("enforces file validation and replaces an existing user upload while waiting", async () => {
    const { app, imageRepository } = await createImageRouteTestApp(hostAuthContext);

    const unsupported = await request(app)
      .post("/api/rooms/ABC123/images")
      .attach("image", Buffer.from("gif-bytes"), {
        filename: "doodle.gif",
        contentType: "image/gif"
      })
      .expect(400);
    const empty = await request(app)
      .post("/api/rooms/ABC123/images")
      .attach("image", Buffer.alloc(0), {
        filename: "empty.png",
        contentType: "image/png"
      })
      .expect(400);

    await request(app)
      .post("/api/rooms/ABC123/images")
      .attach("image", Buffer.from("png-bytes"), {
        filename: "doodle.png",
        contentType: "image/png"
      })
      .expect(201);

    const replacement = await request(app)
      .post("/api/rooms/ABC123/images")
      .attach("image", Buffer.from("more-bytes"), {
        filename: "second.png",
        contentType: "image/png"
      })
      .expect(201);
    const activeImages = await imageRepository.listImagesByRoomCode("ABC123");
    const oldImage = await imageRepository.findImageById("image-1");

    expect(unsupported.body.error.code).toBe("IMAGE_FILE_TYPE_UNSUPPORTED");
    expect(empty.body.error.code).toBe("IMAGE_FILE_EMPTY");
    expect(replacement.body.image).toMatchObject({
      id: "image-2",
      originalName: "second.png",
      active: true
    });
    expect(activeImages).toHaveLength(1);
    expect(activeImages[0]?.id).toBe("image-2");
    expect(oldImage?.active).toBe(false);
  });
});

async function createImageRouteTestApp(
  authContext: AuthContext,
  initialRooms?: RoomDetail[],
  storedProfile?: {
    nickname?: string | null;
    avatarUrl?: string | null;
  }
) {
  const roomRepository = new InMemoryRoomRepository({
    initialRooms,
    roomCodeGenerator: () => "ABC123",
    now: () => new Date("2026-06-06T00:00:00.000Z")
  });

  if (!initialRooms) {
    await roomRepository.createRoom({
      host: {
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: "https://example.com/host.png"
      },
      title: "Image Room",
      settings: roomSettings
    });
  }

  const imageRepository = new InMemoryImageRepository({
    now: () => new Date("2026-06-06T00:00:00.000Z")
  });
  const imageStorage = new InMemoryImageStorage();
  const userRepository = new InMemoryUserRepository();
  await userRepository.upsertByFirebaseUid({
    firebaseUid: authContext.user.firebaseUid,
    email: authContext.user.email,
    nickname: storedProfile?.nickname ?? authContext.user.nickname,
    nicknameNormalized: (
      storedProfile?.nickname ?? authContext.user.nickname
    )?.toLowerCase() ?? null,
    avatarUrl: storedProfile?.avatarUrl ?? authContext.user.avatarUrl,
    profileSetupCompletedAt: storedProfile?.nickname
      ? "2026-06-06T00:00:00.000Z"
      : null
  });
  const roomUpdatePublisher = {
    publishRoomUpdated: vi.fn()
  };
  const app = createApp({
    authMiddleware: createStubAuthMiddleware(authContext),
    imageRepository,
    imageStorage,
    roomRepository,
    roomUpdatePublisher,
    userRepository
  });

  return {
    app,
    imageRepository,
    imageStorage,
    roomRepository,
    roomUpdatePublisher
  };
}

function createStubAuthMiddleware(context?: AuthContext): RequestHandler {
  return (request, _response, next) => {
    (request as AuthenticatedRequest).auth = context;
    next();
  };
}

function createRoomDetail(input: { status: RoomDetail["status"] }): RoomDetail {
  return {
    roomCode: "ABC123",
    title: "Image Room",
    status: input.status,
    hostUid: "host-uid",
    settings: roomSettings,
    participantCount: 1,
    maxPlayers: roomSettings.maxPlayers,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    participants: [
      {
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: "https://example.com/host.png",
        isHost: true,
        joinedAt: "2026-06-06T00:00:00.000Z"
      }
    ],
    currentRoundIndex: 0
  };
}

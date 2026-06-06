import type { AuthContext, RoomDetail, RoomSettings } from "@doodle/shared";
import type { RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import type { AuthenticatedRequest } from "../auth/http";
import { InMemoryRoomRepository } from "../rooms/in-memory-room-repository";
import { InMemoryResultRepository } from "./in-memory-result-repository";
import { InMemoryResultImageStorage } from "./in-memory-result-storage";

const roomSettings: RoomSettings = {
  roundDurationSec: 60,
  maxPlayers: 4,
  maxImagesPerUser: 3
};

const hostAuthContext: AuthContext = {
  user: {
    firebaseUid: "host-uid",
    email: "host@example.com",
    nickname: "Host",
    avatarUrl: null
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

describe("result routes", () => {
  it("lists room results for participants with cursor pagination", async () => {
    const { app, resultRepository } =
      await createResultRouteTestApp(hostAuthContext);
    await createResult(resultRepository, {
      roundId: "round-1",
      resultFileId: "result-file-1"
    });
    await createResult(resultRepository, {
      roundId: "round-2",
      resultFileId: "result-file-2"
    });
    await createResult(resultRepository, {
      roundId: "round-3",
      resultFileId: "result-file-3"
    });

    const firstPage = await request(app)
      .get("/api/rooms/abc123/results?limit=2")
      .expect(200);

    expect(firstPage.body.results.map((result: { roundId: string }) => result.roundId)).toEqual([
      "round-3",
      "round-2"
    ]);
    expect(firstPage.body.page).toMatchObject({
      limit: 2,
      cursor: null
    });
    expect(firstPage.body.page.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(app)
      .get(`/api/rooms/ABC123/results?limit=2&cursor=${firstPage.body.page.nextCursor}`)
      .expect(200);

    expect(secondPage.body.results.map((result: { roundId: string }) => result.roundId)).toEqual([
      "round-1"
    ]);
    expect(secondPage.body.page.nextCursor).toBeNull();
  });

  it("streams result images with download headers", async () => {
    const { app, resultRepository, resultStorage } =
      await createResultRouteTestApp(hostAuthContext);
    await resultStorage.storeResultImage({
      buffer: Buffer.from("result-png"),
      metadata: {
        roomCode: "ABC123",
        roundId: "round-1",
        sourceImageId: "image-1",
        mimeType: "image/png",
        createdAt: "2026-06-06T00:01:00.000Z"
      }
    });
    const result = await createResult(resultRepository, {
      roundId: "round-1",
      resultFileId: "result-file-1"
    });

    const response = await request(app)
      .get(`/api/results/${result.id}/download`)
      .expect(200);

    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["content-length"]).toBe("10");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="doodle-ABC123-0.png"'
    );
    expect(response.headers["cache-control"]).toBe(
      "private, max-age=0, no-cache"
    );
    expect(Buffer.from(response.body).toString("utf8")).toBe("result-png");
  });

  it("rejects result access from non-participants", async () => {
    const { app, resultRepository } =
      await createResultRouteTestApp(guestAuthContext);
    const result = await createResult(resultRepository, {
      roundId: "round-1",
      resultFileId: "result-file-1"
    });

    const listResponse = await request(app)
      .get("/api/rooms/ABC123/results")
      .expect(403);
    const downloadResponse = await request(app)
      .get(`/api/results/${result.id}/download`)
      .expect(403);

    expect(listResponse.body.error.code).toBe("ROOM_ACCESS_DENIED");
    expect(downloadResponse.body.error.code).toBe("ROOM_ACCESS_DENIED");
  });

  it("returns result route error codes for invalid query and missing resources", async () => {
    const { app, resultRepository } =
      await createResultRouteTestApp(hostAuthContext);
    const result = await createResult(resultRepository, {
      roundId: "round-1",
      resultFileId: "missing-file"
    });

    const invalidLimit = await request(app)
      .get("/api/rooms/ABC123/results?limit=99")
      .expect(400);
    const invalidCursor = await request(app)
      .get("/api/rooms/ABC123/results?cursor=not-a-cursor")
      .expect(400);
    const missingRoom = await request(app)
      .get("/api/rooms/NONE01/results")
      .expect(404);
    const missingResult = await request(app)
      .get("/api/results/missing-result/download")
      .expect(404);
    const missingFile = await request(app)
      .get(`/api/results/${result.id}/download`)
      .expect(404);

    expect(invalidLimit.body.error.code).toBe("RESULT_QUERY_INVALID");
    expect(invalidCursor.body.error.code).toBe("RESULT_QUERY_INVALID");
    expect(missingRoom.body.error.code).toBe("ROOM_NOT_FOUND");
    expect(missingResult.body.error.code).toBe("RESULT_NOT_FOUND");
    expect(missingFile.body.error.code).toBe("RESULT_FILE_NOT_FOUND");
  });
});

async function createResultRouteTestApp(authContext: AuthContext) {
  const roomRepository = new InMemoryRoomRepository({
    initialRooms: [createRoomDetail()],
    now: () => new Date("2026-06-06T00:00:00.000Z")
  });
  const resultRepository = new InMemoryResultRepository({
    now: createClock([
      "2026-06-06T00:00:01.000Z",
      "2026-06-06T00:00:02.000Z",
      "2026-06-06T00:00:03.000Z",
      "2026-06-06T00:00:04.000Z"
    ])
  });
  const resultStorage = new InMemoryResultImageStorage();
  const app = createApp({
    authMiddleware: createStubAuthMiddleware(authContext),
    resultRepository,
    resultStorage,
    roomRepository
  });

  return { app, resultRepository, resultStorage, roomRepository };
}

async function createResult(
  repository: InMemoryResultRepository,
  input: { roundId: string; resultFileId: string }
) {
  return repository.createResult({
    roomCode: "ABC123",
    roundId: input.roundId,
    roundIndex: Number.parseInt(input.roundId.replace("round-", ""), 10) - 1,
    sourceImageId: "image-1",
    sourceImageFileId: "source-file-1",
    resultFileId: input.resultFileId,
    thumbnailFileId: null,
    mimeType: "image/png",
    width: 640,
    height: 480,
    strokeCount: 1
  });
}

function createStubAuthMiddleware(context?: AuthContext): RequestHandler {
  return (request, _response, next) => {
    (request as AuthenticatedRequest).auth = context;
    next();
  };
}

function createRoomDetail(): RoomDetail {
  return {
    roomCode: "ABC123",
    title: "Result Room",
    status: "finished",
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
        avatarUrl: null,
        isHost: true,
        joinedAt: "2026-06-06T00:00:00.000Z"
      }
    ],
    currentRoundIndex: 0
  };
}

function createClock(values: string[]): () => Date {
  return () => new Date(values.shift() ?? "2026-06-06T00:00:59.000Z");
}


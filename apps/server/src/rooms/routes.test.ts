import type { AuthContext, RoomSettings } from "@doodle/shared";
import type { RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import type { AuthenticatedRequest } from "../auth/http";
import { InMemoryRoomRepository } from "./in-memory-room-repository";

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

const smallRoomSettings: RoomSettings = {
  roundDurationSec: 45,
  maxPlayers: 2,
  maxImagesPerUser: 1
};

function createStubAuthMiddleware(context?: AuthContext): RequestHandler {
  return (request, _response, next) => {
    (request as AuthenticatedRequest).auth = context;
    next();
  };
}

describe("Room routes", () => {
  it("creates a room for the authenticated user", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "abc123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(hostAuthContext),
      roomRepository: repository
    });

    const response = await request(app)
      .post("/api/rooms")
      .send({
        title: "  Friday Doodles  ",
        settings: smallRoomSettings
      })
      .expect(201);

    expect(response.body.room).toMatchObject({
      roomCode: "ABC123",
      title: "Friday Doodles",
      status: "waiting",
      hostUid: "host-uid",
      settings: smallRoomSettings,
      participantCount: 1,
      maxPlayers: 2
    });
    expect(response.body.room.participants).toEqual([
      {
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: "https://example.com/host.png",
        isHost: true,
        joinedAt: "2026-06-06T00:00:00.000Z"
      }
    ]);
  });

  it("uses safe defaults when create room body is empty", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "DEF456",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(hostAuthContext),
      roomRepository: repository
    });

    const response = await request(app).post("/api/rooms").send({}).expect(201);

    expect(response.body.room).toMatchObject({
      title: "Untitled Room",
      settings: {
        roundDurationSec: 60,
        maxPlayers: 8,
        maxImagesPerUser: 1
      }
    });
  });

  it("gets a room by roomCode", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    await repository.createRoom({
      host: {
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: null
      },
      title: "Lookup Room",
      settings: smallRoomSettings
    });
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(guestAuthContext),
      roomRepository: repository
    });

    const response = await request(app).get("/api/rooms/abc123").expect(200);

    expect(response.body.room).toMatchObject({
      roomCode: "ABC123",
      title: "Lookup Room"
    });
  });

  it("joins an existing room as the authenticated user", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: createClock([
        "2026-06-06T00:00:00.000Z",
        "2026-06-06T00:00:01.000Z"
      ])
    });
    await repository.createRoom({
      host: {
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: null
      },
      title: "Join Room",
      settings: smallRoomSettings
    });
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(guestAuthContext),
      roomRepository: repository
    });

    const response = await request(app)
      .post("/api/rooms/abc123/join")
      .send({})
      .expect(200);

    expect(response.body.room).toMatchObject({
      roomCode: "ABC123",
      participantCount: 2
    });
    expect(response.body.room.participants[1]).toEqual({
      firebaseUid: "guest-uid",
      nickname: "Guest",
      avatarUrl: null,
      isHost: false,
      joinedAt: "2026-06-06T00:00:01.000Z"
    });
  });

  it("returns room domain errors as API errors", async () => {
    const repository = new InMemoryRoomRepository();
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(guestAuthContext),
      roomRepository: repository
    });

    const getResponse = await request(app).get("/api/rooms/NONE01").expect(404);
    const joinResponse = await request(app)
      .post("/api/rooms/NONE01/join")
      .send({})
      .expect(404);

    expect(getResponse.body).toEqual({
      error: {
        code: "ROOM_NOT_FOUND",
        message: "Room was not found."
      }
    });
    expect(joinResponse.body).toEqual({
      error: {
        code: "ROOM_NOT_FOUND",
        message: "Room was not found."
      }
    });
  });

  it("returns 401 when auth context is missing", async () => {
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(undefined),
      roomRepository: new InMemoryRoomRepository()
    });

    const response = await request(app).post("/api/rooms").send({}).expect(401);

    expect(response.body).toEqual({
      error: {
        code: "AUTH_TOKEN_MISSING",
        message: "Authentication is required."
      }
    });
  });
});

function createClock(values: string[]): () => Date {
  return () => new Date(values.shift() ?? "2026-06-06T00:00:59.000Z");
}

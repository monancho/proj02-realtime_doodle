import type { AuthContext } from "@doodle/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createServerDependencies } from "./bootstrap";
import type { ServerEnv } from "./config/env";
import type { MongoDbConnection } from "./db/mongodb";
import { InMemoryImageRepository } from "./images/in-memory-image-repository";
import { InMemoryImageStorage } from "./images/in-memory-image-storage";
import { InMemoryRoomRepository } from "./rooms/in-memory-room-repository";
import { InMemoryUserRepository } from "./users/in-memory-user-repository";

const env: ServerEnv = {
  NODE_ENV: "test",
  PORT: "4000",
  CLIENT_URL: "http://localhost:5173",
  SOCKET_CORS_ORIGIN: "http://localhost:5173",
  MONGODB_URI: "placeholder-uri",
  MONGODB_DB_NAME: "realtime-doodle-relay",
  FIREBASE_PROJECT_ID: "placeholder-project",
  FIREBASE_CLIENT_EMAIL: "placeholder@example.com",
  FIREBASE_PRIVATE_KEY: "placeholder-private-key"
};

const authContext: AuthContext = {
  user: {
    firebaseUid: "firebase-uid",
    email: "user@example.com",
    nickname: "Firebase User",
    avatarUrl: null
  }
};

describe("createServerDependencies", () => {
  it("wires MongoDB, Firebase verifier, and UserRepository into the app", async () => {
    const mongoConnection = {
      client: { close: vi.fn() },
      db: { databaseName: "realtime-doodle-relay" }
    } as unknown as MongoDbConnection;
    const verifier = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: authContext.user.firebaseUid,
        email: authContext.user.email ?? undefined,
        name: authContext.user.nickname ?? undefined
      })
    };
    const userRepository = new InMemoryUserRepository();
    const roomRepository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123"
    });
    const imageRepository = new InMemoryImageRepository();
    const imageStorage = new InMemoryImageStorage();

    const dependencies = await createServerDependencies(env, {
      connectDb: vi.fn().mockResolvedValue(mongoConnection),
      createVerifier: () => verifier,
      createImageRepository: vi.fn().mockResolvedValue(imageRepository),
      createImageStorage: () => imageStorage,
      createRoomRepository: vi.fn().mockResolvedValue(roomRepository),
      createUserRepository: vi.fn().mockResolvedValue(userRepository)
    });

    const response = await request(dependencies.app)
      .post("/api/users/me")
      .set("Authorization", "Bearer test-token")
      .send({})
      .expect(200);

    expect(response.body.user).toMatchObject({
      firebaseUid: "firebase-uid",
      email: "user@example.com",
      nickname: "Firebase User"
    });
    expect(verifier.verifyIdToken).toHaveBeenCalledWith("test-token");
    expect(dependencies.mongoConnection).toBe(mongoConnection);
    expect(dependencies.tokenVerifier).toBe(verifier);
  });

  it("wires the RoomRepository into the app", async () => {
    const mongoConnection = {
      client: { close: vi.fn() },
      db: { databaseName: "realtime-doodle-relay" }
    } as unknown as MongoDbConnection;
    const verifier = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: authContext.user.firebaseUid,
        email: authContext.user.email ?? undefined,
        name: authContext.user.nickname ?? undefined
      })
    };
    const userRepository = new InMemoryUserRepository();
    const roomRepository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123"
    });
    const imageRepository = new InMemoryImageRepository();
    const imageStorage = new InMemoryImageStorage();

    const dependencies = await createServerDependencies(env, {
      connectDb: vi.fn().mockResolvedValue(mongoConnection),
      createVerifier: () => verifier,
      createImageRepository: vi.fn().mockResolvedValue(imageRepository),
      createImageStorage: () => imageStorage,
      createRoomRepository: vi.fn().mockResolvedValue(roomRepository),
      createUserRepository: vi.fn().mockResolvedValue(userRepository)
    });

    const response = await request(dependencies.app)
      .post("/api/rooms")
      .set("Authorization", "Bearer test-token")
      .send({ title: "Bootstrap Room" })
      .expect(201);

    expect(response.body.room).toMatchObject({
      roomCode: "ABC123",
      title: "Bootstrap Room",
      hostUid: "firebase-uid"
    });
    expect(dependencies.roomRepository).toBe(roomRepository);
  });
});

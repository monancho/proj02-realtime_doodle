import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";

import type { ServerEnv } from "../config/env";
import { InMemoryImageRepository } from "../images/in-memory-image-repository";
import { InMemoryRoomRepository } from "../rooms/in-memory-room-repository";
import { createSocketServer } from "./server";

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

describe("createSocketServer", () => {
  it("creates a Socket.IO server with auth and room membership handlers", () => {
    const httpServer = createServer();
    const tokenVerifier = {
      verifyIdToken: vi.fn()
    };

    const io = createSocketServer({
      env,
      httpServer,
      imageRepository: new InMemoryImageRepository(),
      roomRepository: new InMemoryRoomRepository(),
      tokenVerifier
    });

    expect(io._nsps.get("/")?.listeners("connection")).toHaveLength(1);

    io.close();
    httpServer.close();
  });
});

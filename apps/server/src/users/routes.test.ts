import type { AuthContext } from "@doodle/shared";
import type { RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import type { AuthenticatedRequest } from "../auth/http";
import { InMemoryUserRepository } from "./in-memory-user-repository";

const authContext: AuthContext = {
  user: {
    firebaseUid: "firebase-uid",
    email: "user@example.com",
    nickname: "Firebase User",
    avatarUrl: "https://example.com/avatar.png"
  }
};

function createStubAuthMiddleware(context?: AuthContext): RequestHandler {
  return (request, _response, next) => {
    (request as AuthenticatedRequest).auth = context;
    next();
  };
}

describe("POST /api/users/me", () => {
  it("upserts the authenticated user profile", async () => {
    const repository = new InMemoryUserRepository();
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(authContext),
      userRepository: repository
    });

    const response = await request(app)
      .post("/api/users/me")
      .send({ nickname: "Doodle User" })
      .expect(200);

    expect(response.body.user).toMatchObject({
      firebaseUid: "firebase-uid",
      email: "user@example.com",
      nickname: "Doodle User",
      avatarUrl: "https://example.com/avatar.png"
    });
    expect(repository.getByFirebaseUid("firebase-uid")?.nickname).toBe(
      "Doodle User"
    );
  });

  it("returns 401 when auth context is missing", async () => {
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(undefined),
      userRepository: new InMemoryUserRepository()
    });

    const response = await request(app).post("/api/users/me").expect(401);

    expect(response.body).toEqual({
      error: {
        code: "AUTH_TOKEN_MISSING",
        message: "Authentication is required."
      }
    });
  });
});

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
      nicknameNormalized: "doodle user",
      avatarUrl: "https://example.com/avatar.png"
    });
    expect(response.body.user.profileSetupCompletedAt).toEqual(expect.any(String));
    expect(repository.getByFirebaseUid("firebase-uid")?.nickname).toBe(
      "Doodle User"
    );
  });

  it("does not complete profile setup without an explicit nickname", async () => {
    const repository = new InMemoryUserRepository();
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(authContext),
      userRepository: repository
    });

    const response = await request(app).post("/api/users/me").send({}).expect(200);

    expect(response.body.user).toMatchObject({
      firebaseUid: "firebase-uid",
      nickname: null,
      nicknameNormalized: null,
      avatarUrl: "https://example.com/avatar.png",
      profileSetupCompletedAt: null
    });
  });

  it("rejects invalid nickname, duplicate nickname, and invalid avatarUrl", async () => {
    const repository = new InMemoryUserRepository();
    await repository.upsertByFirebaseUid({
      firebaseUid: "other-uid",
      email: "other@example.com",
      nickname: "Taken",
      nicknameNormalized: "taken",
      avatarUrl: null,
      profileSetupCompletedAt: "2026-06-07T00:00:00.000Z"
    });
    const app = createApp({
      authMiddleware: createStubAuthMiddleware(authContext),
      userRepository: repository
    });

    const shortNicknameResponse = await request(app)
      .post("/api/users/me")
      .send({ nickname: "A" })
      .expect(400);
    const duplicateResponse = await request(app)
      .post("/api/users/me")
      .send({ nickname: " taken " })
      .expect(409);
    const avatarResponse = await request(app)
      .post("/api/users/me")
      .send({ nickname: "Fresh", avatarUrl: "http://example.com/avatar.png" })
      .expect(400);

    expect(shortNicknameResponse.body.error.code).toBe("USER_NICKNAME_INVALID");
    expect(duplicateResponse.body.error.code).toBe("USER_NICKNAME_DUPLICATE");
    expect(avatarResponse.body.error.code).toBe("USER_AVATAR_URL_INVALID");
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

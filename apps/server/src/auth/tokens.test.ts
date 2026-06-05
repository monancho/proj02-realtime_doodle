import { describe, expect, it, vi } from "vitest";

import { AuthError } from "./errors";
import { extractBearerToken, verifyAuthToken } from "./tokens";

describe("extractBearerToken", () => {
  it("extracts a bearer token", () => {
    expect(extractBearerToken("Bearer test-token")).toBe("test-token");
  });

  it("rejects missing or malformed header values", () => {
    expect(() => extractBearerToken(undefined)).toThrow(AuthError);
    expect(() => extractBearerToken("Basic test-token")).toThrow(AuthError);
    expect(() => extractBearerToken("Bearer")).toThrow(AuthError);
  });
});

describe("verifyAuthToken", () => {
  it("maps a verified Firebase token to auth context", async () => {
    const verifier = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-uid",
        email: "user@example.com",
        name: "User",
        picture: "https://example.com/avatar.png",
        iat: 100,
        exp: 200
      })
    };

    await expect(verifyAuthToken("token", verifier)).resolves.toEqual({
      user: {
        firebaseUid: "firebase-uid",
        email: "user@example.com",
        nickname: "User",
        avatarUrl: "https://example.com/avatar.png"
      },
      tokenIssuedAt: 100,
      tokenExpiresAt: 200
    });
    expect(verifier.verifyIdToken).toHaveBeenCalledWith("token");
  });

  it("maps verifier failures to auth errors without exposing token values", async () => {
    const verifier = {
      verifyIdToken: vi.fn().mockRejectedValue({
        code: "auth/id-token-expired"
      })
    };

    await expect(verifyAuthToken("secret-token", verifier)).rejects.toMatchObject({
      code: "AUTH_TOKEN_EXPIRED"
    });
  });
});

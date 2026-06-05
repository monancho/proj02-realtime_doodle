import type { AuthContext, AuthenticatedUser } from "@doodle/shared";

import { AuthError } from "./errors";

export interface VerifiedFirebaseToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  iat?: number;
  exp?: number;
}

export interface TokenVerifier {
  verifyIdToken(token: string): Promise<VerifiedFirebaseToken>;
}

export function extractBearerToken(headerValue: string | undefined): string {
  if (!headerValue) {
    throw new AuthError("AUTH_TOKEN_MISSING");
  }

  const [scheme, token, ...rest] = headerValue.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || rest.length > 0) {
    throw new AuthError("AUTH_TOKEN_MISSING");
  }

  return token;
}

export async function verifyAuthToken(
  token: string,
  verifier: TokenVerifier
): Promise<AuthContext> {
  try {
    const decoded = await verifier.verifyIdToken(token);
    return mapDecodedTokenToAuthContext(decoded);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError(mapFirebaseVerifyError(error));
  }
}

function mapDecodedTokenToAuthContext(
  token: VerifiedFirebaseToken
): AuthContext {
  if (!token.uid) {
    throw new AuthError("AUTH_TOKEN_INVALID");
  }

  const user: AuthenticatedUser = {
    firebaseUid: token.uid,
    email: token.email ?? null,
    nickname: token.name ?? null,
    avatarUrl: token.picture ?? null
  };

  return {
    user,
    tokenIssuedAt: token.iat,
    tokenExpiresAt: token.exp
  };
}

function mapFirebaseVerifyError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code.includes("id-token-expired")) {
    return "AUTH_TOKEN_EXPIRED";
  }

  if (code.includes("user-disabled")) {
    return "AUTH_USER_DISABLED";
  }

  return "AUTH_TOKEN_INVALID";
}

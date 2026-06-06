export interface AuthenticatedUser {
  firebaseUid: string;
  email: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface AuthContext {
  user: AuthenticatedUser;
  tokenIssuedAt?: number;
  tokenExpiresAt?: number;
}

export type AuthErrorCode =
  | "AUTH_TOKEN_MISSING"
  | "AUTH_TOKEN_INVALID"
  | "AUTH_TOKEN_EXPIRED"
  | "AUTH_USER_DISABLED"
  | "AUTH_PROVIDER_UNSUPPORTED"
  | "AUTH_FORBIDDEN";

export interface AuthErrorResponse {
  error: {
    code: AuthErrorCode;
    message: string;
  };
}

export interface SocketAuthPayload {
  token: string;
}

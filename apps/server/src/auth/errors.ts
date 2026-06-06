import type { AuthErrorCode, AuthErrorResponse } from "@doodle/shared";

const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  AUTH_TOKEN_MISSING: "Authentication is required.",
  AUTH_TOKEN_INVALID: "Authentication token is invalid.",
  AUTH_TOKEN_EXPIRED: "Authentication token has expired.",
  AUTH_USER_DISABLED: "User is disabled.",
  AUTH_PROVIDER_UNSUPPORTED: "Only Google sign-in is supported.",
  AUTH_FORBIDDEN: "You do not have permission to perform this action."
};

export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly statusCode: number;

  public constructor(code: AuthErrorCode, statusCode = 401) {
    super(AUTH_ERROR_MESSAGES[code]);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function toAuthErrorResponse(error: AuthError): AuthErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message
    }
  };
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

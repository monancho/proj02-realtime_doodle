export type ImageErrorCode =
  | "IMAGE_FILE_EMPTY"
  | "IMAGE_FILE_TOO_LARGE"
  | "IMAGE_FILE_TYPE_UNSUPPORTED"
  | "IMAGE_LIMIT_REACHED"
  | "IMAGE_MODERATION_BLOCKED"
  | "IMAGE_MODERATION_FAILED"
  | "IMAGE_MODERATION_REVIEW_REQUIRED"
  | "IMAGE_UPLOAD_LIMIT_EXCEEDED"
  | "IMAGE_NOT_FOUND"
  | "IMAGE_PAYLOAD_INVALID"
  | "ROOM_ACCESS_DENIED"
  | "ROOM_NOT_FOUND"
  | "ROOM_STATE_INVALID";

export class ImageDomainError extends Error {
  public constructor(
    public readonly code: ImageErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ImageDomainError";
  }
}

export function getImageErrorHttpStatus(code: ImageErrorCode): number {
  switch (code) {
    case "IMAGE_PAYLOAD_INVALID":
    case "IMAGE_FILE_EMPTY":
    case "IMAGE_FILE_TOO_LARGE":
    case "IMAGE_FILE_TYPE_UNSUPPORTED":
    case "IMAGE_MODERATION_BLOCKED":
    case "IMAGE_MODERATION_REVIEW_REQUIRED":
      return 400;
    case "IMAGE_MODERATION_FAILED":
      return 502;
    case "ROOM_ACCESS_DENIED":
      return 403;
    case "IMAGE_NOT_FOUND":
    case "ROOM_NOT_FOUND":
      return 404;
    case "IMAGE_LIMIT_REACHED":
    case "IMAGE_UPLOAD_LIMIT_EXCEEDED":
    case "ROOM_STATE_INVALID":
      return 409;
  }
}

export type RoomErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_ALREADY_STARTED"
  | "ROOM_CODE_COLLISION"
  | "ROOM_ACCESS_DENIED"
  | "ROOM_STATE_INVALID";

export class RoomDomainError extends Error {
  public constructor(
    public readonly code: RoomErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RoomDomainError";
  }
}

export function getRoomErrorHttpStatus(code: RoomErrorCode): number {
  switch (code) {
    case "ROOM_NOT_FOUND":
      return 404;
    case "ROOM_FULL":
    case "ROOM_ALREADY_STARTED":
    case "ROOM_STATE_INVALID":
      return 409;
    case "ROOM_ACCESS_DENIED":
      return 403;
    case "ROOM_CODE_COLLISION":
      return 500;
  }
}

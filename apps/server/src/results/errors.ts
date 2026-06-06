export type ResultErrorCode =
  | "RESULT_FILE_NOT_FOUND"
  | "RESULT_NOT_FOUND"
  | "RESULT_QUERY_INVALID"
  | "ROOM_ACCESS_DENIED"
  | "ROOM_NOT_FOUND";

export class ResultDomainError extends Error {
  public constructor(
    public readonly code: ResultErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ResultDomainError";
  }
}

export function getResultErrorHttpStatus(code: ResultErrorCode): number {
  switch (code) {
    case "RESULT_QUERY_INVALID":
      return 400;
    case "ROOM_ACCESS_DENIED":
      return 403;
    case "RESULT_FILE_NOT_FOUND":
    case "RESULT_NOT_FOUND":
    case "ROOM_NOT_FOUND":
      return 404;
  }
}


export const sharedPackageBoundary = {
  packageName: "@doodle/shared",
  responsibility: "API contracts, Socket event payload types, domain types, and validation contracts"
} as const;

export type { ApiErrorResponse, HealthResponse } from "./api";
export type {
  AuthContext,
  AuthenticatedUser,
  AuthErrorCode,
  AuthErrorResponse,
  SocketAuthPayload
} from "./auth";
export { REQUIRED_SERVER_ENV_KEYS } from "./env";
export type { RequiredServerEnvKey } from "./env";
export type {
  ImageMetadata,
  ImageMimeType,
  ImageUploader,
  ListRoomImagesResponse,
  UploadImageResponse
} from "./image";
export type {
  CreateRoomRequest,
  CreateRoomResponse,
  GetRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  RoomDetail,
  RoomParticipant,
  RoomSettings,
  RoomStatus,
  RoomSummary
} from "./room";
export type { ResultMetadata } from "./result";
export type { UpsertMeRequest, UpsertMeResponse, UserProfile } from "./user";

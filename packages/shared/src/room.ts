export type RoomStatus = "waiting" | "playing" | "finished";

export interface RoomSettings {
  roundDurationSec: number;
  maxPlayers: number;
  maxImagesPerUser: number;
}

export interface RoomParticipant {
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  joinedAt: string;
}

export interface RoomSummary {
  roomCode: string;
  title: string;
  status: RoomStatus;
  hostUid: string;
  settings: RoomSettings;
  participantCount: number;
  maxPlayers: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomDetail extends RoomSummary {
  participants: RoomParticipant[];
  currentRoundIndex: number;
}

export interface CreateRoomRequest {
  title?: string | null;
  settings?: Partial<RoomSettings>;
}

export interface CreateRoomResponse {
  room: RoomDetail;
}

export type JoinRoomRequest = Record<string, never>;

export interface JoinRoomResponse {
  room: RoomDetail;
}

export interface GetRoomResponse {
  room: RoomDetail;
}

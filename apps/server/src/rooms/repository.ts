import type { RoomDetail, RoomSettings } from "@doodle/shared";

export interface RoomActorInput {
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface CreateRoomInput {
  host: RoomActorInput;
  title: string;
  settings: RoomSettings;
}

export interface JoinRoomInput {
  roomCode: string;
  participant: RoomActorInput;
}

export interface RoomRepository {
  createRoom(input: CreateRoomInput): Promise<RoomDetail>;
  findRoomByCode(roomCode: string): Promise<RoomDetail | null>;
  joinRoom(input: JoinRoomInput): Promise<RoomDetail>;
}

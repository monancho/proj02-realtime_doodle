import type { RoomDetail } from "@doodle/shared";
import type { Server } from "socket.io";

import { normalizeRoomCode } from "./room-code";

export interface RoomUpdatePublisher {
  publishRoomUpdated(room: RoomDetail): void;
}

export class SocketRoomUpdatePublisher implements RoomUpdatePublisher {
  private io: Pick<Server, "to"> | null = null;

  public attach(io: Pick<Server, "to">): void {
    this.io = io;
  }

  public publishRoomUpdated(room: RoomDetail): void {
    this.io
      ?.to(createSocketRoomName(room.roomCode))
      .emit("room-updated", { room });
  }
}

export function createSocketRoomName(roomCode: string): string {
  return `room:${normalizeRoomCode(roomCode)}`;
}

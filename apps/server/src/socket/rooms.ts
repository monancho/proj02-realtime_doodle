import type { AuthContext, RoomDetail } from "@doodle/shared";
import type { Server, Socket } from "socket.io";

import type { RoomRepository } from "../rooms/repository";
import { normalizeRoomCode } from "../rooms/room-code";

const SOCKET_ROOM_PREFIX = "room:";

export interface SocketErrorPayload {
  code:
    | "AUTH_TOKEN_MISSING"
    | "ROOM_ACCESS_DENIED"
    | "ROOM_NOT_FOUND"
    | "ROOM_PAYLOAD_INVALID";
  message: string;
}

export interface RoomUpdatedPayload {
  room: RoomDetail;
}

interface RoomEventDependencies {
  io: Pick<Server, "to">;
  repository: RoomRepository;
  socket: Pick<Socket, "data" | "emit" | "join" | "leave">;
}

export function registerRoomMembershipHandlers(
  io: Server,
  repository: RoomRepository
): void {
  io.on("connection", (socket) => {
    socket.on("join-room", (payload: unknown) => {
      void handleJoinRoom({ io, repository, socket }, payload);
    });

    socket.on("leave-room", (payload: unknown) => {
      void handleLeaveRoom({ io, repository, socket }, payload);
    });
  });
}

export async function handleJoinRoom(
  dependencies: RoomEventDependencies,
  payload: unknown
): Promise<void> {
  const auth = getSocketAuth(dependencies.socket);
  if (!auth) {
    emitSocketError(dependencies.socket, {
      code: "AUTH_TOKEN_MISSING",
      message: "Authentication is required."
    });
    return;
  }

  const roomCode = parseRoomCode(payload);
  if (!roomCode) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_PAYLOAD_INVALID",
      message: "roomCode must be a non-empty string."
    });
    return;
  }

  const room = await dependencies.repository.findRoomByCode(roomCode);
  if (!room) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_NOT_FOUND",
      message: "Room was not found."
    });
    return;
  }

  const isParticipant = room.participants.some(
    (participant) => participant.firebaseUid === auth.user.firebaseUid
  );
  if (!isParticipant) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_ACCESS_DENIED",
      message: "Join the room over HTTP before opening the socket room."
    });
    return;
  }

  const socketRoomName = createSocketRoomName(room.roomCode);

  await dependencies.socket.join(socketRoomName);
  emitRoomUpdated(dependencies.io, room);
}

export async function handleLeaveRoom(
  dependencies: RoomEventDependencies,
  payload: unknown
): Promise<void> {
  const roomCode = parseRoomCode(payload);
  if (!roomCode) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_PAYLOAD_INVALID",
      message: "roomCode must be a non-empty string."
    });
    return;
  }

  const room = await dependencies.repository.findRoomByCode(roomCode);
  if (!room) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_NOT_FOUND",
      message: "Room was not found."
    });
    return;
  }

  await dependencies.socket.leave(createSocketRoomName(room.roomCode));
  emitRoomUpdated(dependencies.io, room);
}

export function createSocketRoomName(roomCode: string): string {
  return `${SOCKET_ROOM_PREFIX}${normalizeRoomCode(roomCode)}`;
}

function emitRoomUpdated(io: Pick<Server, "to">, room: RoomDetail): void {
  io.to(createSocketRoomName(room.roomCode)).emit("room-updated", { room });
}

function emitSocketError(
  socket: Pick<Socket, "emit">,
  payload: SocketErrorPayload
): void {
  socket.emit("socket-error", payload);
}

function getSocketAuth(
  socket: Pick<Socket, "data">
): AuthContext | undefined {
  return socket.data.auth as AuthContext | undefined;
}

function parseRoomCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const roomCode = (payload as { roomCode?: unknown }).roomCode;

  if (typeof roomCode !== "string") {
    return null;
  }

  const normalizedRoomCode = normalizeRoomCode(roomCode);

  return normalizedRoomCode.length > 0 ? normalizedRoomCode : null;
}

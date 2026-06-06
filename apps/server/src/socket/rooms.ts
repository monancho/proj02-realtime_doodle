import type { AuthContext, RoomDetail } from "@doodle/shared";
import type { Server, Socket } from "socket.io";

import type { RoomRepository } from "../rooms/repository";
import { normalizeRoomCode } from "../rooms/room-code";

const SOCKET_ROOM_PREFIX = "room:";
const MAX_CHAT_MESSAGE_LENGTH = 200;
const MAX_RECENT_CHAT_MESSAGES = 50;

export interface SocketErrorPayload {
  code:
    | "AUTH_TOKEN_MISSING"
    | "CHAT_MESSAGE_EMPTY"
    | "CHAT_MESSAGE_TOO_LONG"
    | "CHAT_PAYLOAD_INVALID"
    | "ROOM_ACCESS_DENIED"
    | "ROOM_NOT_FOUND"
    | "ROOM_PAYLOAD_INVALID";
  message: string;
}

export interface RoomUpdatedPayload {
  room: RoomDetail;
}

export interface SendMessagePayload {
  roomCode: string;
  message: string;
}

export interface ReceiveMessagePayload {
  roomCode: string;
  type: "chat";
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
  message: string;
  createdAt: string;
}

interface RoomEventDependencies {
  io: Pick<Server, "to">;
  repository: RoomRepository;
  socket: Pick<Socket, "data" | "emit" | "join" | "leave">;
}

interface ChatEventDependencies extends RoomEventDependencies {
  now: () => Date;
  recentMessages: RecentChatMessageStore;
}

export class RecentChatMessageStore {
  private readonly messagesByRoomCode = new Map<string, ReceiveMessagePayload[]>();

  public append(message: ReceiveMessagePayload): void {
    const roomCode = normalizeRoomCode(message.roomCode);
    const messages = this.messagesByRoomCode.get(roomCode) ?? [];
    const nextMessages = [...messages, message].slice(-MAX_RECENT_CHAT_MESSAGES);

    this.messagesByRoomCode.set(roomCode, nextMessages);
  }

  public list(roomCode: string): ReceiveMessagePayload[] {
    return [...(this.messagesByRoomCode.get(normalizeRoomCode(roomCode)) ?? [])];
  }
}

export function registerRoomMembershipHandlers(
  io: Server,
  repository: RoomRepository
): void {
  const recentMessages = new RecentChatMessageStore();

  io.on("connection", (socket) => {
    socket.on("join-room", (payload: unknown) => {
      void handleJoinRoom({ io, repository, socket }, payload);
    });

    socket.on("leave-room", (payload: unknown) => {
      void handleLeaveRoom({ io, repository, socket }, payload);
    });

    socket.on("send-message", (payload: unknown) => {
      void handleSendMessage(
        {
          io,
          repository,
          socket,
          recentMessages,
          now: () => new Date()
        },
        payload
      );
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

export async function handleSendMessage(
  dependencies: ChatEventDependencies,
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

  const parsedPayload = parseSendMessagePayload(payload);
  if (!parsedPayload) {
    emitSocketError(dependencies.socket, {
      code: "CHAT_PAYLOAD_INVALID",
      message: "roomCode and message must be non-empty strings."
    });
    return;
  }

  if (parsedPayload.message.length === 0) {
    emitSocketError(dependencies.socket, {
      code: "CHAT_MESSAGE_EMPTY",
      message: "Message must not be empty."
    });
    return;
  }

  if (parsedPayload.message.length > MAX_CHAT_MESSAGE_LENGTH) {
    emitSocketError(dependencies.socket, {
      code: "CHAT_MESSAGE_TOO_LONG",
      message: "Message must be 200 characters or fewer."
    });
    return;
  }

  const room = await dependencies.repository.findRoomByCode(
    parsedPayload.roomCode
  );
  if (!room) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_NOT_FOUND",
      message: "Room was not found."
    });
    return;
  }

  const participant = room.participants.find(
    (roomParticipant) =>
      roomParticipant.firebaseUid === auth.user.firebaseUid
  );
  if (!participant) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_ACCESS_DENIED",
      message: "Join the room over HTTP before sending chat messages."
    });
    return;
  }

  const message: ReceiveMessagePayload = {
    roomCode: room.roomCode,
    type: "chat",
    firebaseUid: participant.firebaseUid,
    nickname: participant.nickname,
    avatarUrl: participant.avatarUrl,
    message: parsedPayload.message,
    createdAt: dependencies.now().toISOString()
  };

  dependencies.recentMessages.append(message);
  dependencies.io
    .to(createSocketRoomName(room.roomCode))
    .emit("receive-message", message);
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

function parseSendMessagePayload(
  payload: unknown
): SendMessagePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { roomCode, message } = payload as {
    roomCode?: unknown;
    message?: unknown;
  };

  if (typeof roomCode !== "string" || typeof message !== "string") {
    return null;
  }

  const normalizedRoomCode = normalizeRoomCode(roomCode);

  if (normalizedRoomCode.length === 0) {
    return null;
  }

  return {
    roomCode: normalizedRoomCode,
    message: message.trim()
  };
}

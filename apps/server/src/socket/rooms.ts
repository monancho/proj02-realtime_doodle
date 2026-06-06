import { randomUUID } from "node:crypto";

import type { AuthContext, ImageMetadata, RoomDetail } from "@doodle/shared";
import type { Server, Socket } from "socket.io";

import type { ImageRepository } from "../images/repository";
import type { RoomRepository } from "../rooms/repository";
import { normalizeRoomCode } from "../rooms/room-code";

const SOCKET_ROOM_PREFIX = "room:";
const MAX_CHAT_MESSAGE_LENGTH = 200;
const MAX_RECENT_CHAT_MESSAGES = 50;
const MAX_DRAW_POINTS_PER_PAYLOAD = 128;
const MAX_RECENT_STROKE_BATCHES = 200;
const DRAW_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface SocketErrorPayload {
  code:
    | "AUTH_TOKEN_MISSING"
    | "CHAT_MESSAGE_EMPTY"
    | "CHAT_MESSAGE_TOO_LONG"
    | "CHAT_PAYLOAD_INVALID"
    | "DRAW_PAYLOAD_INVALID"
    | "ROOM_HOST_REQUIRED"
    | "ROOM_ACCESS_DENIED"
    | "ROOM_NOT_FOUND"
    | "ROOM_PAYLOAD_INVALID"
    | "ROOM_STATE_INVALID"
    | "ROUND_IMAGE_NOT_FOUND";
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

export interface DrawPoint {
  x: number;
  y: number;
  pressure?: number | null;
  t?: number | null;
}

export interface DrawStroke {
  strokeId: string;
  tool: "pen" | "eraser";
  color: string;
  width: number;
  points: DrawPoint[];
}

export interface DrawStrokePayload {
  roomCode: string;
  roundId: string;
  stroke: DrawStroke;
}

export interface DrawStrokeBroadcastPayload extends DrawStrokePayload {
  firebaseUid: string;
  createdAt: string;
}

export interface StartGamePayload {
  roomCode: string;
}

export interface RoundStartedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  image: ImageMetadata;
  durationSec: number;
  startedAt: string;
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

interface DrawingEventDependencies extends RoomEventDependencies {
  now: () => Date;
  recentStrokeBatches: RecentStrokeBatchStore;
}

interface RoundEventDependencies extends RoomEventDependencies {
  imageRepository: ImageRepository;
  now: () => Date;
  roundIdGenerator: () => string;
  selectImage: (images: ImageMetadata[]) => ImageMetadata;
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

export class RecentStrokeBatchStore {
  private readonly strokeBatchesByRoomRound = new Map<
    string,
    DrawStrokeBroadcastPayload[]
  >();

  public append(strokeBatch: DrawStrokeBroadcastPayload): void {
    const key = createStrokeBatchKey(strokeBatch.roomCode, strokeBatch.roundId);
    const strokeBatches = this.strokeBatchesByRoomRound.get(key) ?? [];
    const nextStrokeBatches = [...strokeBatches, strokeBatch].slice(
      -MAX_RECENT_STROKE_BATCHES
    );

    this.strokeBatchesByRoomRound.set(key, nextStrokeBatches);
  }

  public list(roomCode: string, roundId: string): DrawStrokeBroadcastPayload[] {
    return [
      ...(this.strokeBatchesByRoomRound.get(
        createStrokeBatchKey(roomCode, roundId)
      ) ?? [])
    ];
  }
}

export function registerRoomMembershipHandlers(
  io: Server,
  repository: RoomRepository,
  imageRepository: ImageRepository
): void {
  const recentMessages = new RecentChatMessageStore();
  const recentStrokeBatches = new RecentStrokeBatchStore();

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

    socket.on("draw-stroke", (payload: unknown) => {
      void handleDrawStroke(
        {
          io,
          repository,
          socket,
          recentStrokeBatches,
          now: () => new Date()
        },
        payload
      );
    });

    socket.on("start-game", (payload: unknown) => {
      void handleStartGame(
        {
          io,
          repository,
          socket,
          imageRepository,
          now: () => new Date(),
          roundIdGenerator: createRoundId,
          selectImage: selectRandomImage
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

export async function handleDrawStroke(
  dependencies: DrawingEventDependencies,
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

  const parsedPayload = parseDrawStrokePayload(payload);
  if (!parsedPayload) {
    emitSocketError(dependencies.socket, {
      code: "DRAW_PAYLOAD_INVALID",
      message: "draw-stroke payload is invalid."
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
      message: "Join the room over HTTP before drawing."
    });
    return;
  }

  const strokeBatch: DrawStrokeBroadcastPayload = {
    ...parsedPayload,
    roomCode: room.roomCode,
    firebaseUid: participant.firebaseUid,
    createdAt: dependencies.now().toISOString()
  };

  dependencies.recentStrokeBatches.append(strokeBatch);
  dependencies.io
    .to(createSocketRoomName(room.roomCode))
    .emit("draw-stroke", strokeBatch);
}

export async function handleStartGame(
  dependencies: RoundEventDependencies,
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
      message: "Join the room before starting the game."
    });
    return;
  }

  if (room.hostUid !== auth.user.firebaseUid) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_HOST_REQUIRED",
      message: "Only the room host can start the game."
    });
    return;
  }

  if (room.status !== "waiting") {
    emitSocketError(dependencies.socket, {
      code: "ROOM_STATE_INVALID",
      message: "Only waiting rooms can be started."
    });
    return;
  }

  const unusedImages =
    await dependencies.imageRepository.listUnusedImagesByRoomCode(room.roomCode);
  if (unusedImages.length === 0) {
    emitSocketError(dependencies.socket, {
      code: "ROUND_IMAGE_NOT_FOUND",
      message: "Upload at least one unused image before starting the game."
    });
    return;
  }

  const selectedCandidate = dependencies.selectImage(unusedImages);
  const selectedImage =
    await dependencies.imageRepository.markImageUsed(selectedCandidate.id);
  if (!selectedImage) {
    emitSocketError(dependencies.socket, {
      code: "ROUND_IMAGE_NOT_FOUND",
      message: "Selected image is no longer available."
    });
    return;
  }

  const startedRoom = await dependencies.repository.startGame({
    roomCode: room.roomCode
  });
  const startedAt = dependencies.now().toISOString();
  const payloadToEmit: RoundStartedPayload = {
    roomCode: startedRoom.roomCode,
    roundId: dependencies.roundIdGenerator(),
    roundIndex: startedRoom.currentRoundIndex,
    image: selectedImage,
    durationSec: startedRoom.settings.roundDurationSec,
    startedAt
  };

  dependencies.io
    .to(createSocketRoomName(startedRoom.roomCode))
    .emit("round-started", payloadToEmit);
  emitRoomUpdated(dependencies.io, startedRoom);
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

function parseDrawStrokePayload(payload: unknown): DrawStrokePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { roomCode, roundId, stroke } = payload as {
    roomCode?: unknown;
    roundId?: unknown;
    stroke?: unknown;
  };

  if (
    typeof roomCode !== "string" ||
    typeof roundId !== "string" ||
    !stroke ||
    typeof stroke !== "object"
  ) {
    return null;
  }

  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const normalizedRoundId = roundId.trim();
  const parsedStroke = parseDrawStroke(stroke);

  if (
    normalizedRoomCode.length === 0 ||
    normalizedRoundId.length === 0 ||
    !parsedStroke
  ) {
    return null;
  }

  return {
    roomCode: normalizedRoomCode,
    roundId: normalizedRoundId,
    stroke: parsedStroke
  };
}

function parseDrawStroke(stroke: object): DrawStroke | null {
  const { strokeId, tool, color, width, points } = stroke as {
    strokeId?: unknown;
    tool?: unknown;
    color?: unknown;
    width?: unknown;
    points?: unknown;
  };

  if (
    typeof strokeId !== "string" ||
    (tool !== "pen" && tool !== "eraser") ||
    typeof color !== "string" ||
    !DRAW_COLOR_PATTERN.test(color) ||
    !isNumberInRange(width, 1, 64) ||
    !Array.isArray(points) ||
    points.length < 1 ||
    points.length > MAX_DRAW_POINTS_PER_PAYLOAD
  ) {
    return null;
  }

  const normalizedStrokeId = strokeId.trim();
  const parsedPoints = points.map(parseDrawPoint);

  if (
    normalizedStrokeId.length === 0 ||
    parsedPoints.some((point) => point === null)
  ) {
    return null;
  }

  return {
    strokeId: normalizedStrokeId,
    tool,
    color,
    width,
    points: parsedPoints as DrawPoint[]
  };
}

function parseDrawPoint(point: unknown): DrawPoint | null {
  if (!point || typeof point !== "object") {
    return null;
  }

  const { x, y, pressure, t } = point as {
    x?: unknown;
    y?: unknown;
    pressure?: unknown;
    t?: unknown;
  };

  if (!isNumberInRange(x, 0, 1) || !isNumberInRange(y, 0, 1)) {
    return null;
  }

  if (
    pressure !== undefined &&
    pressure !== null &&
    !isNumberInRange(pressure, 0, 1)
  ) {
    return null;
  }

  if (t !== undefined && t !== null && !isNumberInRange(t, 0, Infinity)) {
    return null;
  }

  return {
    x,
    y,
    ...(pressure !== undefined ? { pressure } : {}),
    ...(t !== undefined ? { t } : {})
  };
}

function isNumberInRange(
  value: unknown,
  min: number,
  max: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function createStrokeBatchKey(roomCode: string, roundId: string): string {
  return `${normalizeRoomCode(roomCode)}:${roundId.trim()}`;
}

function selectRandomImage(images: ImageMetadata[]): ImageMetadata {
  return images[Math.floor(Math.random() * images.length)] ?? images[0];
}

function createRoundId(): string {
  return `round-${randomUUID()}`;
}

import { randomUUID } from "node:crypto";

import type { AuthContext, ImageMetadata, RoomDetail } from "@doodle/shared";
import type { Server, Socket } from "socket.io";

import type { ImageRepository } from "../images/repository";
import type { ImageStorage } from "../images/storage";
import { DeterministicPngResultImageComposer } from "../results/composer";
import { InMemoryResultRepository } from "../results/in-memory-result-repository";
import { InMemoryResultImageStorage } from "../results/in-memory-result-storage";
import {
  ResultSaveService,
  type ResultSavedPayload
} from "../results/service";
import type { RoomRepository } from "../rooms/repository";
import { normalizeRoomCode } from "../rooms/room-code";
import type { UserRepository } from "../users/repository";

const SOCKET_ROOM_PREFIX = "room:";
const MAX_CHAT_MESSAGE_LENGTH = 200;
const MAX_RECENT_CHAT_MESSAGES = 50;
const MAX_DRAW_POINTS_PER_PAYLOAD = 128;
const MAX_RECENT_STROKE_BATCHES = 10000;
const GAME_START_COUNTDOWN_SEC = 5;
const DRAW_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface SocketErrorPayload {
  code:
    | "AUTH_TOKEN_MISSING"
    | "CHAT_MESSAGE_EMPTY"
    | "CHAT_MESSAGE_TOO_LONG"
    | "CHAT_PAYLOAD_INVALID"
    | "CURSOR_PAYLOAD_INVALID"
    | "DRAW_ROUND_CLOSED"
    | "DRAW_PAYLOAD_INVALID"
    | "ROOM_HOST_REQUIRED"
    | "ROOM_ACCESS_DENIED"
    | "ROOM_NOT_FOUND"
    | "ROOM_PAYLOAD_INVALID"
    | "ROOM_PARTICIPANTS_NOT_READY"
    | "ROOM_SPECTATOR_DRAWING_DENIED"
    | "ROOM_STATE_INVALID"
    | "ROUND_IMAGE_NOT_FOUND"
    | "ROUND_STATE_INVALID"
    | "USER_PROFILE_NOT_FOUND";
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

export interface CursorMovePayload {
  roomCode: string;
  roundId: string;
  x: number;
  y: number;
  tool: DrawStroke["tool"];
  color: string;
  width: number;
}

export interface CursorMoveBroadcastPayload extends CursorMovePayload {
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
  updatedAt: string;
}

export interface StartGamePayload {
  roomCode: string;
}

export interface PrepareNextGamePayload {
  roomCode: string;
}

export interface ProfileUpdatedPayload {
  roomCode: string;
}

export interface GameStartingPayload {
  roomCode: string;
  countdownSec: number;
  startsAt: string;
  room: RoomDetail;
}

export interface RoundStartedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  image: ImageMetadata;
  durationSec: number;
  startedAt: string;
}

export interface RoundEndedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  image: ImageMetadata;
  endedAt: string;
}

export interface GameFinishedPayload {
  roomCode: string;
  room: RoomDetail;
  finishedAt: string;
}

export interface ActiveRoundState {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  image: ImageMetadata;
  durationSec?: number;
  startedAt?: string;
}

interface RoomEventDependencies {
  io: Pick<Server, "to">;
  imageRepository?: ImageRepository;
  repository: RoomRepository;
  recentStrokeBatches?: RecentStrokeBatchStore;
  roundState?: RoundRuntimeStateStore;
  socket: Pick<Socket, "data" | "emit" | "join" | "leave">;
}

interface ChatEventDependencies extends RoomEventDependencies {
  now: () => Date;
  recentMessages: RecentChatMessageStore;
}

interface DrawingEventDependencies extends RoomEventDependencies {
  now: () => Date;
  recentStrokeBatches: RecentStrokeBatchStore;
  roundState: RoundRuntimeStateStore;
}

interface RoundEventDependencies extends RoomEventDependencies {
  imageRepository: ImageRepository;
  now: () => Date;
  recentStrokeBatches: RecentStrokeBatchStore;
  roundIdGenerator: () => string;
  resultSaveService: Pick<ResultSaveService, "saveRoundResult">;
  selectImage: (images: ImageMetadata[]) => ImageMetadata;
  roundState: RoundRuntimeStateStore;
  timerScheduler: RoundTimerScheduler;
}

interface ProfileEventDependencies extends RoomEventDependencies {
  userRepository: UserRepository;
}

interface RoundTimerDependencies {
  io: Pick<Server, "to">;
  repository: RoomRepository;
  imageRepository: ImageRepository;
  now: () => Date;
  recentStrokeBatches: RecentStrokeBatchStore;
  roundIdGenerator: () => string;
  resultSaveService: Pick<ResultSaveService, "saveRoundResult">;
  selectImage: (images: ImageMetadata[]) => ImageMetadata;
  roundState: RoundRuntimeStateStore;
  timerScheduler: RoundTimerScheduler;
}

export interface RoundTimerScheduler {
  schedule(input: {
    roomCode: string;
    roundId: string;
    durationSec: number;
    onExpire: () => void;
  }): void;
  clear(roomCode: string): void;
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

export class RoundRuntimeStateStore {
  private readonly activeRoundsByRoomCode = new Map<string, ActiveRoundState>();
  private readonly closedRoundKeys = new Set<string>();

  public startRound(round: ActiveRoundState): void {
    const roomCode = normalizeRoomCode(round.roomCode);
    this.activeRoundsByRoomCode.set(roomCode, {
      ...round,
      roomCode,
      image: { ...round.image, uploadedBy: { ...round.image.uploadedBy } }
    });
  }

  public getActiveRound(roomCode: string): ActiveRoundState | null {
    const activeRound = this.activeRoundsByRoomCode.get(
      normalizeRoomCode(roomCode)
    );

    return activeRound
      ? {
          ...activeRound,
          image: {
            ...activeRound.image,
            uploadedBy: { ...activeRound.image.uploadedBy }
          }
        }
      : null;
  }

  public closeRound(roomCode: string, roundId: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const activeRound = this.activeRoundsByRoomCode.get(normalizedRoomCode);

    if (activeRound?.roundId === roundId) {
      this.activeRoundsByRoomCode.delete(normalizedRoomCode);
    }

    this.closedRoundKeys.add(createStrokeBatchKey(normalizedRoomCode, roundId));
  }

  public clearRoom(roomCode: string): void {
    this.activeRoundsByRoomCode.delete(normalizeRoomCode(roomCode));
  }

  public isRoundClosed(roomCode: string, roundId: string): boolean {
    return this.closedRoundKeys.has(createStrokeBatchKey(roomCode, roundId));
  }
}

export class InMemoryRoundTimerScheduler implements RoundTimerScheduler {
  private readonly timersByRoomCode = new Map<string, ReturnType<typeof setTimeout>>();

  public schedule(input: {
    roomCode: string;
    roundId: string;
    durationSec: number;
    onExpire: () => void;
  }): void {
    const roomCode = normalizeRoomCode(input.roomCode);
    this.clear(roomCode);

    const timer = setTimeout(() => {
      this.timersByRoomCode.delete(roomCode);
      input.onExpire();
    }, input.durationSec * 1000);

    this.timersByRoomCode.set(roomCode, timer);
  }

  public clear(roomCode: string): void {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const timer = this.timersByRoomCode.get(normalizedRoomCode);

    if (timer) {
      clearTimeout(timer);
      this.timersByRoomCode.delete(normalizedRoomCode);
    }
  }
}

export function registerRoomMembershipHandlers(
  io: Server,
  repository: RoomRepository,
  imageRepository: ImageRepository,
  imageStorage?: ImageStorage,
  resultSaveService?: ResultSaveService,
  userRepository?: UserRepository
): void {
  const recentMessages = new RecentChatMessageStore();
  const recentStrokeBatches = new RecentStrokeBatchStore();
  const roundState = new RoundRuntimeStateStore();
  const timerScheduler = new InMemoryRoundTimerScheduler();
  const saveService =
    resultSaveService ??
    (imageStorage
      ? new ResultSaveService({
          composer: new DeterministicPngResultImageComposer(),
          imageStorage,
          now: () => new Date(),
          resultRepository: new InMemoryResultRepository(),
          resultStorage: new InMemoryResultImageStorage()
        })
      : null);

  io.on("connection", (socket) => {
    socket.on("join-room", (payload: unknown) => {
      void handleJoinRoom(
        { io, repository, socket, recentStrokeBatches, roundState },
        payload
      );
    });

    socket.on("leave-room", (payload: unknown) => {
      void handleLeaveRoom({ io, imageRepository, repository, socket }, payload);
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
          roundState,
          now: () => new Date()
        },
        payload
      );
    });

    socket.on("cursor-move", (payload: unknown) => {
      void handleCursorMove(
        {
          io,
          repository,
          socket,
          recentStrokeBatches,
          roundState,
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
          recentStrokeBatches,
          roundIdGenerator: createRoundId,
          resultSaveService: saveService ?? createDisabledResultSaveService(),
          selectImage: selectRandomImage,
          roundState,
          timerScheduler
        },
        payload
      );
    });

    socket.on("prepare-next-game", (payload: unknown) => {
      void handlePrepareNextGame(
        {
          io,
          repository,
          socket,
          imageRepository,
          now: () => new Date(),
          recentStrokeBatches,
          roundIdGenerator: createRoundId,
          resultSaveService: saveService ?? createDisabledResultSaveService(),
          selectImage: selectRandomImage,
          roundState,
          timerScheduler
        },
        payload
      );
    });

    socket.on("profile-updated", (payload: unknown) => {
      if (!userRepository) {
        socket.emit("socket-error", {
          code: "USER_PROFILE_NOT_FOUND",
          message: "User profile repository is not configured."
        } satisfies SocketErrorPayload);
        return;
      }

      void handleProfileUpdated(
        {
          io,
          repository,
          socket,
          userRepository
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
  emitActiveRoundSnapshotIfAvailable(dependencies, room);
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
  const auth = getSocketAuth(dependencies.socket);

  if (room.status === "waiting" && auth) {
    await dependencies.imageRepository?.deactivateActiveImagesByUploader({
      roomCode: room.roomCode,
      firebaseUid: auth.user.firebaseUid
    });

    const nextRoom =
      await dependencies.repository.removeWaitingParticipant({
        roomCode: room.roomCode,
        firebaseUid: auth.user.firebaseUid
      });

    emitRoomUpdated(dependencies.io, nextRoom ?? room);
    return;
  }

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

  if (participant.isSpectator) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_SPECTATOR_DRAWING_DENIED",
      message: "Spectators cannot draw in the active game."
    });
    return;
  }

  if (room.status !== "playing") {
    emitSocketError(dependencies.socket, {
      code: "ROOM_STATE_INVALID",
      message: "Drawing is only available while the room is playing."
    });
    return;
  }

  const activeRound = dependencies.roundState.getActiveRound(room.roomCode);
  if (activeRound?.roundId !== parsedPayload.roundId) {
    emitSocketError(dependencies.socket, {
      code: dependencies.roundState.isRoundClosed(
        room.roomCode,
        parsedPayload.roundId
      )
        ? "DRAW_ROUND_CLOSED"
        : "ROUND_STATE_INVALID",
      message: "The drawing round is not active."
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

export async function handleCursorMove(
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

  const parsedPayload = parseCursorMovePayload(payload);
  if (!parsedPayload) {
    emitSocketError(dependencies.socket, {
      code: "CURSOR_PAYLOAD_INVALID",
      message: "cursor-move payload is invalid."
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
      message: "Join the room before sharing cursor position."
    });
    return;
  }

  if (room.status !== "playing") {
    emitSocketError(dependencies.socket, {
      code: "ROOM_STATE_INVALID",
      message: "Cursor sharing is only available while the room is playing."
    });
    return;
  }

  const activeRound = dependencies.roundState.getActiveRound(room.roomCode);
  if (activeRound?.roundId !== parsedPayload.roundId) {
    emitSocketError(dependencies.socket, {
      code: dependencies.roundState.isRoundClosed(
        room.roomCode,
        parsedPayload.roundId
      )
        ? "DRAW_ROUND_CLOSED"
        : "ROUND_STATE_INVALID",
      message: "The drawing round is not active."
    });
    return;
  }

  const cursorMove: CursorMoveBroadcastPayload = {
    ...parsedPayload,
    roomCode: room.roomCode,
    firebaseUid: participant.firebaseUid,
    nickname: participant.nickname,
    avatarUrl: participant.avatarUrl,
    updatedAt: dependencies.now().toISOString()
  };

  dependencies.io
    .to(createSocketRoomName(room.roomCode))
    .emit("cursor-move", cursorMove);
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

  const roomImages = await dependencies.imageRepository.listImagesByRoomCode(
    room.roomCode
  );
  if (!areAllParticipantsReady(room, roomImages)) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_PARTICIPANTS_NOT_READY",
      message: "Every participant must upload one image before starting."
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

  const startedRoom = await dependencies.repository.startGame({
    roomCode: room.roomCode
  });
  const startsAtDate = new Date(
    dependencies.now().getTime() + GAME_START_COUNTDOWN_SEC * 1000
  );
  const payloadToEmit: GameStartingPayload = {
    roomCode: startedRoom.roomCode,
    countdownSec: GAME_START_COUNTDOWN_SEC,
    startsAt: startsAtDate.toISOString(),
    room: startedRoom
  };

  dependencies.io
    .to(createSocketRoomName(startedRoom.roomCode))
    .emit("game-starting", payloadToEmit);
  emitRoomUpdated(dependencies.io, startedRoom);
  dependencies.timerScheduler.schedule({
    roomCode: startedRoom.roomCode,
    roundId: "game-starting",
    durationSec: GAME_START_COUNTDOWN_SEC,
    onExpire: () => {
      void handleGameCountdownExpired(dependencies, startedRoom.roomCode);
    }
  });
}

export async function handleGameCountdownExpired(
  dependencies: RoundTimerDependencies,
  roomCode: string
): Promise<void> {
  const room = await dependencies.repository.findRoomByCode(roomCode);
  if (!room || room.status !== "starting") {
    return;
  }

  const unusedImages =
    await dependencies.imageRepository.listUnusedImagesByRoomCode(room.roomCode);
  if (unusedImages.length === 0) {
    return;
  }

  const selectedCandidate = dependencies.selectImage(unusedImages);
  const selectedImage =
    await dependencies.imageRepository.markImageUsed(selectedCandidate.id);
  if (!selectedImage) {
    return;
  }

  const playingRoom = await dependencies.repository.beginGame({
    roomCode: room.roomCode
  });
  const startedPayload: RoundStartedPayload = {
    roomCode: playingRoom.roomCode,
    roundId: dependencies.roundIdGenerator(),
    roundIndex: playingRoom.currentRoundIndex,
    image: selectedImage,
    durationSec: playingRoom.settings.roundDurationSec,
    startedAt: dependencies.now().toISOString()
  };

  dependencies.roundState.startRound(startedPayload);
  dependencies.io
    .to(createSocketRoomName(playingRoom.roomCode))
    .emit("round-started", startedPayload);
  emitRoomUpdated(dependencies.io, playingRoom);
  scheduleRoundTimer(dependencies, startedPayload);
}

export async function handleProfileUpdated(
  dependencies: ProfileEventDependencies,
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
      message: "Join the room before updating participant profile."
    });
    return;
  }

  const profile = await dependencies.userRepository.findByFirebaseUid(
    auth.user.firebaseUid
  );
  if (!profile) {
    emitSocketError(dependencies.socket, {
      code: "USER_PROFILE_NOT_FOUND",
      message: "User profile was not found."
    });
    return;
  }

  const updatedRoom = await dependencies.repository.updateParticipantProfile({
    roomCode: room.roomCode,
    firebaseUid: auth.user.firebaseUid,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl
  });
  if (!updatedRoom) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_ACCESS_DENIED",
      message: "Join the room before updating participant profile."
    });
    return;
  }

  emitRoomUpdated(dependencies.io, updatedRoom);
}

export async function handlePrepareNextGame(
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
      message: "Join the room before preparing the next game."
    });
    return;
  }

  if (room.hostUid !== auth.user.firebaseUid) {
    emitSocketError(dependencies.socket, {
      code: "ROOM_HOST_REQUIRED",
      message: "Only the room host can prepare the next game."
    });
    return;
  }

  if (room.status !== "finished") {
    emitSocketError(dependencies.socket, {
      code: "ROOM_STATE_INVALID",
      message: "Only finished rooms can be prepared for another game."
    });
    return;
  }

  dependencies.roundState.clearRoom(room.roomCode);
  dependencies.timerScheduler.clear(room.roomCode);
  await dependencies.imageRepository.deactivateActiveImagesByRoomCode(
    room.roomCode
  );
  const preparedRoom = await dependencies.repository.prepareNextGame({
    roomCode: room.roomCode
  });

  emitRoomUpdated(dependencies.io, preparedRoom);
}

export async function handleRoundTimerExpired(
  dependencies: RoundTimerDependencies,
  expiredRound: ActiveRoundState
): Promise<void> {
  const room = await dependencies.repository.findRoomByCode(
    expiredRound.roomCode
  );
  if (!room || room.status !== "playing") {
    return;
  }

  const activeRound = dependencies.roundState.getActiveRound(room.roomCode);
  if (activeRound?.roundId !== expiredRound.roundId) {
    return;
  }

  dependencies.roundState.closeRound(room.roomCode, expiredRound.roundId);

  const endedPayload: RoundEndedPayload = {
    roomCode: room.roomCode,
    roundId: expiredRound.roundId,
    roundIndex: expiredRound.roundIndex,
    image: expiredRound.image,
    endedAt: dependencies.now().toISOString()
  };

  dependencies.io
    .to(createSocketRoomName(room.roomCode))
    .emit("round-ended", endedPayload);
  const resultSavedPayload = await dependencies.resultSaveService.saveRoundResult(
    {
      round: endedPayload,
      strokes: dependencies.recentStrokeBatches.list(
        room.roomCode,
        expiredRound.roundId
      )
    }
  );

  if (resultSavedPayload) {
    emitResultSaved(dependencies.io, resultSavedPayload);
  }

  const unusedImages =
    await dependencies.imageRepository.listUnusedImagesByRoomCode(room.roomCode);

  if (unusedImages.length > 0) {
    const selectedCandidate = dependencies.selectImage(unusedImages);
    const selectedImage =
      await dependencies.imageRepository.markImageUsed(selectedCandidate.id);

    if (selectedImage) {
      const advancedRoom = await dependencies.repository.advanceRound({
        roomCode: room.roomCode
      });
      const startedPayload: RoundStartedPayload = {
        roomCode: advancedRoom.roomCode,
        roundId: dependencies.roundIdGenerator(),
        roundIndex: advancedRoom.currentRoundIndex,
        image: selectedImage,
        durationSec: advancedRoom.settings.roundDurationSec,
        startedAt: dependencies.now().toISOString()
      };

      dependencies.roundState.startRound(startedPayload);
      dependencies.io
        .to(createSocketRoomName(advancedRoom.roomCode))
        .emit("round-started", startedPayload);
      emitRoomUpdated(dependencies.io, advancedRoom);
      scheduleRoundTimer(dependencies, startedPayload);
      return;
    }
  }

  const finishedRoom = await dependencies.repository.finishGame({
    roomCode: room.roomCode
  });
  dependencies.roundState.clearRoom(finishedRoom.roomCode);
  dependencies.timerScheduler.clear(finishedRoom.roomCode);

  const finishedPayload: GameFinishedPayload = {
    roomCode: finishedRoom.roomCode,
    room: finishedRoom,
    finishedAt: dependencies.now().toISOString()
  };

  dependencies.io
    .to(createSocketRoomName(finishedRoom.roomCode))
    .emit("game-finished", finishedPayload);
  emitRoomUpdated(dependencies.io, finishedRoom);
}

function scheduleRoundTimer(
  dependencies: RoundTimerDependencies,
  round: ActiveRoundState & { durationSec: number }
): void {
  dependencies.timerScheduler.schedule({
    roomCode: round.roomCode,
    roundId: round.roundId,
    durationSec: round.durationSec,
    onExpire: () => {
      void handleRoundTimerExpired(dependencies, round);
    }
  });
}

function emitResultSaved(
  io: Pick<Server, "to">,
  payload: ResultSavedPayload
): void {
  io.to(createSocketRoomName(payload.roomCode)).emit("result-saved", payload);
}

function areAllParticipantsReady(
  room: RoomDetail,
  images: ImageMetadata[]
): boolean {
  const uploaders = new Set(
    images
      .filter((image) => image.active !== false)
      .map((image) => image.uploadedBy.firebaseUid)
  );

  return room.participants.every(
    (participant) =>
      participant.isSpectator === true || uploaders.has(participant.firebaseUid)
  );
}

function createDisabledResultSaveService(): Pick<
  ResultSaveService,
  "saveRoundResult"
> {
  return {
    saveRoundResult: async () => null
  };
}

export function createSocketRoomName(roomCode: string): string {
  return `${SOCKET_ROOM_PREFIX}${normalizeRoomCode(roomCode)}`;
}

function emitActiveRoundSnapshotIfAvailable(
  dependencies: RoomEventDependencies,
  room: RoomDetail
): void {
  if (room.status !== "playing") {
    return;
  }

  const activeRound = dependencies.roundState?.getActiveRound(room.roomCode);
  if (!activeRound?.durationSec || !activeRound.startedAt) {
    return;
  }

  const payload: RoundStartedPayload = {
    roomCode: activeRound.roomCode,
    roundId: activeRound.roundId,
    roundIndex: activeRound.roundIndex,
    image: activeRound.image,
    durationSec: activeRound.durationSec,
    startedAt: activeRound.startedAt
  };

  dependencies.socket.emit("round-started", payload);

  for (const strokeBatch of dependencies.recentStrokeBatches?.list(
    activeRound.roomCode,
    activeRound.roundId
  ) ?? []) {
    dependencies.socket.emit("draw-stroke", strokeBatch);
  }
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

function parseCursorMovePayload(payload: unknown): CursorMovePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { roomCode, roundId, x, y, tool, color, width } = payload as {
    roomCode?: unknown;
    roundId?: unknown;
    x?: unknown;
    y?: unknown;
    tool?: unknown;
    color?: unknown;
    width?: unknown;
  };

  if (
    typeof roomCode !== "string" ||
    typeof roundId !== "string" ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof tool !== "string" ||
    typeof color !== "string" ||
    typeof width !== "number"
  ) {
    return null;
  }

  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const normalizedRoundId = roundId.trim();

  if (
    normalizedRoomCode.length === 0 ||
    normalizedRoundId.length === 0 ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1 ||
    (tool !== "pen" && tool !== "eraser") ||
    !DRAW_COLOR_PATTERN.test(color) ||
    !Number.isFinite(width) ||
    width <= 0 ||
    width > 32
  ) {
    return null;
  }

  return {
    roomCode: normalizedRoomCode,
    roundId: normalizedRoundId,
    x,
    y,
    tool,
    color,
    width
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

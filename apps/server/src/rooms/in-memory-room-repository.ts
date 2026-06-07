import type {
  RoomDetail,
  RoomParticipant,
  RoomSettings,
  RoomStatus
} from "@doodle/shared";

import { RoomDomainError } from "./errors";
import type {
  AdvanceRoundInput,
  BeginGameInput,
  CreateRoomInput,
  FinishGameInput,
  JoinRoomInput,
  PrepareNextGameInput,
  RemoveWaitingParticipantInput,
  RoomRepository,
  StartGameInput,
  UpdateParticipantProfileInput
} from "./repository";
import { generateRoomCode, normalizeRoomCode, type RoomCodeGenerator } from "./room-code";

const ROOM_CODE_MAX_ATTEMPTS = 5;

export interface InMemoryRoomRepositoryOptions {
  roomCodeGenerator?: RoomCodeGenerator;
  now?: () => Date;
  initialRooms?: RoomDetail[];
}

export class InMemoryRoomRepository implements RoomRepository {
  private readonly roomsByCode = new Map<string, RoomDetail>();
  private readonly roomCodeGenerator: RoomCodeGenerator;
  private readonly now: () => Date;

  public constructor(options: InMemoryRoomRepositoryOptions = {}) {
    this.roomCodeGenerator = options.roomCodeGenerator ?? generateRoomCode;
    this.now = options.now ?? (() => new Date());

    for (const room of options.initialRooms ?? []) {
      this.roomsByCode.set(normalizeRoomCode(room.roomCode), room);
    }
  }

  public async createRoom(input: CreateRoomInput): Promise<RoomDetail> {
    for (let attempt = 0; attempt < ROOM_CODE_MAX_ATTEMPTS; attempt += 1) {
      const roomCode = normalizeRoomCode(this.roomCodeGenerator());

      if (this.roomsByCode.has(roomCode)) {
        continue;
      }

      const now = this.now().toISOString();
      const hostParticipant: RoomParticipant = {
        firebaseUid: input.host.firebaseUid,
        nickname: input.host.nickname,
        avatarUrl: input.host.avatarUrl,
        isHost: true,
        joinedAt: now
      };
      const room = createRoomDetail({
        roomCode,
        title: input.title,
        hostUid: input.host.firebaseUid,
        status: "waiting",
        settings: input.settings,
        participants: [hostParticipant],
        currentRoundIndex: 0,
        createdAt: now,
        updatedAt: now
      });

      this.roomsByCode.set(roomCode, room);

      return cloneRoom(room);
    }

    throw new RoomDomainError(
      "ROOM_CODE_COLLISION",
      "Room code collision retry limit exceeded."
    );
  }

  public async findRoomByCode(roomCode: string): Promise<RoomDetail | null> {
    const room = this.roomsByCode.get(normalizeRoomCode(roomCode));

    return room ? cloneRoom(room) : null;
  }

  public async joinRoom(input: JoinRoomInput): Promise<RoomDetail> {
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const room = this.roomsByCode.get(normalizedRoomCode);

    if (!room) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    const existingParticipant = room.participants.find(
      (participant) => participant.firebaseUid === input.participant.firebaseUid
    );

    if (existingParticipant) {
      return cloneRoom(room);
    }

    if (room.status !== "waiting" && room.status !== "starting" && room.status !== "playing" && room.status !== "finished") {
      throw new RoomDomainError(
        "ROOM_ALREADY_STARTED",
        "Only waiting rooms can be joined."
      );
    }

    if (
      room.status === "waiting" &&
      countActiveParticipants(room) >= room.settings.maxPlayers
    ) {
      throw new RoomDomainError(
        "ROOM_PARTICIPANTS_FULL",
        "Room has reached max players."
      );
    }

    const now = this.now().toISOString();
    const nextRoom = createRoomDetail({
      ...room,
      participants: [
        ...room.participants,
        {
          firebaseUid: input.participant.firebaseUid,
          nickname: input.participant.nickname,
          avatarUrl: input.participant.avatarUrl,
          isHost: input.participant.firebaseUid === room.hostUid,
          ...(room.status !== "waiting" ? { isSpectator: true } : {}),
          joinedAt: now
        }
      ],
      updatedAt: now
    });

    this.roomsByCode.set(normalizedRoomCode, nextRoom);

    return cloneRoom(nextRoom);
  }

  public async startGame(input: StartGameInput): Promise<RoomDetail> {
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const room = this.roomsByCode.get(normalizedRoomCode);

    if (!room) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    if (room.status !== "waiting") {
      throw new RoomDomainError(
        "ROOM_STATE_INVALID",
        "Only waiting rooms can be started."
      );
    }

    const nextRoom = createRoomDetail({
      ...room,
      status: "starting",
      currentRoundIndex: 0,
      updatedAt: this.now().toISOString()
    });

    this.roomsByCode.set(normalizedRoomCode, nextRoom);

    return cloneRoom(nextRoom);
  }

  public async beginGame(input: BeginGameInput): Promise<RoomDetail> {
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const room = this.roomsByCode.get(normalizedRoomCode);

    if (!room) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    if (room.status !== "starting") {
      throw new RoomDomainError(
        "ROOM_STATE_INVALID",
        "Only starting rooms can begin play."
      );
    }

    const nextRoom = createRoomDetail({
      ...room,
      status: "playing",
      updatedAt: this.now().toISOString()
    });

    this.roomsByCode.set(normalizedRoomCode, nextRoom);

    return cloneRoom(nextRoom);
  }

  public async advanceRound(input: AdvanceRoundInput): Promise<RoomDetail> {
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const room = this.roomsByCode.get(normalizedRoomCode);

    if (!room) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    if (room.status !== "playing") {
      throw new RoomDomainError(
        "ROOM_STATE_INVALID",
        "Only playing rooms can advance rounds."
      );
    }

    const nextRoom = createRoomDetail({
      ...room,
      currentRoundIndex: room.currentRoundIndex + 1,
      updatedAt: this.now().toISOString()
    });

    this.roomsByCode.set(normalizedRoomCode, nextRoom);

    return cloneRoom(nextRoom);
  }

  public async finishGame(input: FinishGameInput): Promise<RoomDetail> {
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const room = this.roomsByCode.get(normalizedRoomCode);

    if (!room) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    if (room.status !== "playing") {
      throw new RoomDomainError(
        "ROOM_STATE_INVALID",
        "Only playing rooms can be finished."
      );
    }

    const nextRoom = createRoomDetail({
      ...room,
      status: "finished",
      updatedAt: this.now().toISOString()
    });

    this.roomsByCode.set(normalizedRoomCode, nextRoom);

    return cloneRoom(nextRoom);
  }

  public async prepareNextGame(input: PrepareNextGameInput): Promise<RoomDetail> {
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const room = this.roomsByCode.get(normalizedRoomCode);

    if (!room) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    if (room.status !== "finished") {
      throw new RoomDomainError(
        "ROOM_STATE_INVALID",
        "Only finished rooms can be prepared for another game."
      );
    }

    const nextRoom = createRoomDetail({
      ...room,
      status: "waiting",
      currentRoundIndex: 0,
      participants: room.participants.map((participant) => ({
        ...participant,
        isSpectator: false
      })),
      updatedAt: this.now().toISOString()
    });

    this.roomsByCode.set(normalizedRoomCode, nextRoom);

    return cloneRoom(nextRoom);
  }

  public async updateParticipantProfile(
    input: UpdateParticipantProfileInput
  ): Promise<RoomDetail | null> {
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const room = this.roomsByCode.get(normalizedRoomCode);

    if (!room) {
      return null;
    }

    const hasParticipant = room.participants.some(
      (participant) => participant.firebaseUid === input.firebaseUid
    );

    if (!hasParticipant) {
      return null;
    }

    const nextRoom = createRoomDetail({
      ...room,
      participants: room.participants.map((participant) =>
        participant.firebaseUid === input.firebaseUid
          ? {
              ...participant,
              nickname: input.nickname,
              avatarUrl: input.avatarUrl
            }
          : participant
      ),
      updatedAt: this.now().toISOString()
    });

    this.roomsByCode.set(normalizedRoomCode, nextRoom);

    return cloneRoom(nextRoom);
  }

  public async removeWaitingParticipant(
    input: RemoveWaitingParticipantInput
  ): Promise<RoomDetail | null> {
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const room = this.roomsByCode.get(normalizedRoomCode);

    if (!room || room.status !== "waiting") {
      return room ? cloneRoom(room) : null;
    }

    const nextParticipants = room.participants.filter(
      (participant) => participant.firebaseUid !== input.firebaseUid
    );

    if (nextParticipants.length === room.participants.length) {
      return cloneRoom(room);
    }

    const nextHostUid =
      room.hostUid === input.firebaseUid
        ? nextParticipants[0]?.firebaseUid ?? room.hostUid
        : room.hostUid;
    const nextRoom = createRoomDetail({
      ...room,
      hostUid: nextHostUid,
      participants: nextParticipants.map((participant) => ({
        ...participant,
        isHost: participant.firebaseUid === nextHostUid
      })),
      updatedAt: this.now().toISOString()
    });

    this.roomsByCode.set(normalizedRoomCode, nextRoom);

    return cloneRoom(nextRoom);
  }
}

interface CreateRoomDetailInput {
  roomCode: string;
  title: string;
  hostUid: string;
  status: RoomStatus;
  settings: RoomSettings;
  participants: RoomParticipant[];
  currentRoundIndex: number;
  createdAt: string;
  updatedAt: string;
}

function createRoomDetail(input: CreateRoomDetailInput): RoomDetail {
  return {
    roomCode: input.roomCode,
    title: input.title,
    status: input.status,
    hostUid: input.hostUid,
    settings: input.settings,
    participantCount: input.participants.length,
    maxPlayers: input.settings.maxPlayers,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    participants: input.participants,
    currentRoundIndex: input.currentRoundIndex
  };
}

function cloneRoom(room: RoomDetail): RoomDetail {
  return {
    ...room,
    settings: { ...room.settings },
    participants: room.participants.map((participant) => ({ ...participant }))
  };
}

function countActiveParticipants(room: RoomDetail): number {
  return room.participants.filter(
    (participant) => participant.isSpectator !== true
  ).length;
}

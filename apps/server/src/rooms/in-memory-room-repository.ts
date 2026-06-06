import type {
  RoomDetail,
  RoomParticipant,
  RoomSettings,
  RoomStatus
} from "@doodle/shared";

import { RoomDomainError } from "./errors";
import type {
  CreateRoomInput,
  JoinRoomInput,
  RoomRepository,
  StartGameInput
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

    if (room.status !== "waiting") {
      throw new RoomDomainError(
        "ROOM_ALREADY_STARTED",
        "Only waiting rooms can be joined."
      );
    }

    if (room.participants.length >= room.settings.maxPlayers) {
      throw new RoomDomainError("ROOM_FULL", "Room has reached max players.");
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
      status: "playing",
      currentRoundIndex: 0,
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

import type {
  RoomDetail,
  RoomParticipant,
  RoomSettings,
  RoomStatus
} from "@doodle/shared";
import type {
  Collection,
  Filter,
  IndexSpecification,
  OptionalUnlessRequiredId,
  UpdateFilter,
  WithId
} from "mongodb";

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
const DUPLICATE_KEY_ERROR_CODE = 11000;

export interface RoomParticipantDocument {
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
  isSpectator?: boolean;
  joinedAt: Date;
}

export interface RoomDocument {
  roomCode: string;
  title: string;
  hostUid: string;
  status: RoomStatus;
  currentRoundIndex: number;
  settings: RoomSettings;
  participants: RoomParticipantDocument[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomCollection {
  insertOne(document: OptionalUnlessRequiredId<RoomDocument>): Promise<unknown>;
  findOne(filter: Filter<RoomDocument>): Promise<WithId<RoomDocument> | null>;
  findOneAndUpdate(
    filter: Filter<RoomDocument>,
    update: UpdateFilter<RoomDocument>,
    options: { returnDocument: "after" }
  ): Promise<WithId<RoomDocument> | null>;
  createIndex(
    indexSpec: IndexSpecification,
    options?: { unique?: true }
  ): Promise<string>;
}

export class MongoRoomRepository implements RoomRepository {
  public constructor(
    private readonly collection: RoomCollection,
    private readonly roomCodeGenerator: RoomCodeGenerator = generateRoomCode
  ) {}

  public async createRoom(input: CreateRoomInput): Promise<RoomDetail> {
    for (let attempt = 0; attempt < ROOM_CODE_MAX_ATTEMPTS; attempt += 1) {
      const now = new Date();
      const roomCode = normalizeRoomCode(this.roomCodeGenerator());
      const document: RoomDocument = {
        roomCode,
        title: input.title,
        hostUid: input.host.firebaseUid,
        status: "waiting",
        currentRoundIndex: 0,
        settings: input.settings,
        participants: [
          {
            firebaseUid: input.host.firebaseUid,
            nickname: input.host.nickname,
            avatarUrl: input.host.avatarUrl,
            joinedAt: now
          }
        ],
        createdAt: now,
        updatedAt: now
      };

      try {
        await this.collection.insertOne(
          document as OptionalUnlessRequiredId<RoomDocument>
        );

        return mapRoomDocumentToDetail(document);
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    throw new RoomDomainError(
      "ROOM_CODE_COLLISION",
      "Room code collision retry limit exceeded."
    );
  }

  public async findRoomByCode(roomCode: string): Promise<RoomDetail | null> {
    const document = await this.collection.findOne({
      roomCode: normalizeRoomCode(roomCode)
    });

    return document ? mapRoomDocumentToDetail(document) : null;
  }

  public async joinRoom(input: JoinRoomInput): Promise<RoomDetail> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const existingRoom = await this.collection.findOne({ roomCode });

    if (!existingRoom) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    if (hasParticipant(existingRoom, input.participant.firebaseUid)) {
      return mapRoomDocumentToDetail(existingRoom);
    }

    if (
      existingRoom.status === "waiting" &&
      countActiveParticipants(existingRoom) >= existingRoom.settings.maxPlayers
    ) {
      throw new RoomDomainError(
        "ROOM_PARTICIPANTS_FULL",
        "Room has reached max players."
      );
    }

    const now = new Date();
    const isSpectator = existingRoom.status !== "waiting";
    const updatedRoom = await this.collection.findOneAndUpdate(
      createJoinRoomFilter(
        roomCode,
        input.participant.firebaseUid,
        existingRoom.status === "waiting"
      ),
      {
        $push: {
          participants: {
            firebaseUid: input.participant.firebaseUid,
            nickname: input.participant.nickname,
            avatarUrl: input.participant.avatarUrl,
            ...(isSpectator ? { isSpectator: true } : {}),
            joinedAt: now
          }
        },
        $set: { updatedAt: now }
      },
      { returnDocument: "after" }
    );

    if (updatedRoom) {
      return mapRoomDocumentToDetail(updatedRoom);
    }

    const latestRoom = await this.collection.findOne({ roomCode });
    if (!latestRoom) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }
    if (hasParticipant(latestRoom, input.participant.firebaseUid)) {
      return mapRoomDocumentToDetail(latestRoom);
    }
    if (
      latestRoom.status === "waiting" &&
      countActiveParticipants(latestRoom) >= latestRoom.settings.maxPlayers
    ) {
      throw new RoomDomainError(
        "ROOM_PARTICIPANTS_FULL",
        "Room has reached max players."
      );
    }

    throw new RoomDomainError(
      "ROOM_CODE_COLLISION",
      "Room join failed because the room changed concurrently."
    );
  }

  public async startGame(input: StartGameInput): Promise<RoomDetail> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const now = new Date();
    const updatedRoom = await this.collection.findOneAndUpdate(
      { roomCode, status: "waiting" },
      {
        $set: {
          status: "starting",
          currentRoundIndex: 0,
          updatedAt: now
        }
      },
      { returnDocument: "after" }
    );

    if (updatedRoom) {
      return mapRoomDocumentToDetail(updatedRoom);
    }

    const latestRoom = await this.collection.findOne({ roomCode });
    if (!latestRoom) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    throw new RoomDomainError(
      "ROOM_STATE_INVALID",
      "Only waiting rooms can be started."
    );
  }

  public async beginGame(input: BeginGameInput): Promise<RoomDetail> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const now = new Date();
    const updatedRoom = await this.collection.findOneAndUpdate(
      { roomCode, status: "starting" },
      {
        $set: {
          status: "playing",
          updatedAt: now
        }
      },
      { returnDocument: "after" }
    );

    if (updatedRoom) {
      return mapRoomDocumentToDetail(updatedRoom);
    }

    const latestRoom = await this.collection.findOne({ roomCode });
    if (!latestRoom) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    throw new RoomDomainError(
      "ROOM_STATE_INVALID",
      "Only starting rooms can begin play."
    );
  }

  public async advanceRound(input: AdvanceRoundInput): Promise<RoomDetail> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const now = new Date();
    const updatedRoom = await this.collection.findOneAndUpdate(
      { roomCode, status: "playing" },
      {
        $inc: { currentRoundIndex: 1 },
        $set: { updatedAt: now }
      },
      { returnDocument: "after" }
    );

    if (updatedRoom) {
      return mapRoomDocumentToDetail(updatedRoom);
    }

    const latestRoom = await this.collection.findOne({ roomCode });
    if (!latestRoom) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    throw new RoomDomainError(
      "ROOM_STATE_INVALID",
      "Only playing rooms can advance rounds."
    );
  }

  public async finishGame(input: FinishGameInput): Promise<RoomDetail> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const now = new Date();
    const updatedRoom = await this.collection.findOneAndUpdate(
      { roomCode, status: "playing" },
      {
        $set: {
          status: "finished",
          updatedAt: now
        }
      },
      { returnDocument: "after" }
    );

    if (updatedRoom) {
      return mapRoomDocumentToDetail(updatedRoom);
    }

    const latestRoom = await this.collection.findOne({ roomCode });
    if (!latestRoom) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    throw new RoomDomainError(
      "ROOM_STATE_INVALID",
      "Only playing rooms can be finished."
    );
  }

  public async prepareNextGame(input: PrepareNextGameInput): Promise<RoomDetail> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const now = new Date();
    const updatedRoom = await this.collection.findOneAndUpdate(
      { roomCode, status: "finished" },
      {
        $set: {
          status: "waiting",
          currentRoundIndex: 0,
          "participants.$[].isSpectator": false,
          updatedAt: now
        }
      } as UpdateFilter<RoomDocument>,
      { returnDocument: "after" }
    );

    if (updatedRoom) {
      return mapRoomDocumentToDetail(updatedRoom);
    }

    const latestRoom = await this.collection.findOne({ roomCode });
    if (!latestRoom) {
      throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found.");
    }

    throw new RoomDomainError(
      "ROOM_STATE_INVALID",
      "Only finished rooms can be prepared for another game."
    );
  }

  public async updateParticipantProfile(
    input: UpdateParticipantProfileInput
  ): Promise<RoomDetail | null> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const now = new Date();
    const updatedRoom = await this.collection.findOneAndUpdate(
      {
        roomCode,
        "participants.firebaseUid": input.firebaseUid
      },
      {
        $set: {
          "participants.$.nickname": input.nickname,
          "participants.$.avatarUrl": input.avatarUrl,
          updatedAt: now
        }
      } as UpdateFilter<RoomDocument>,
      { returnDocument: "after" }
    );

    return updatedRoom ? mapRoomDocumentToDetail(updatedRoom) : null;
  }

  public async removeWaitingParticipant(
    input: RemoveWaitingParticipantInput
  ): Promise<RoomDetail | null> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const existingRoom = await this.collection.findOne({
      roomCode,
      status: "waiting"
    });

    if (!existingRoom) {
      const latestRoom = await this.collection.findOne({ roomCode });
      return latestRoom ? mapRoomDocumentToDetail(latestRoom) : null;
    }

    const nextParticipants = existingRoom.participants.filter(
      (participant) => participant.firebaseUid !== input.firebaseUid
    );

    if (nextParticipants.length === existingRoom.participants.length) {
      return mapRoomDocumentToDetail(existingRoom);
    }

    const nextHostUid =
      existingRoom.hostUid === input.firebaseUid
        ? nextParticipants[0]?.firebaseUid ?? existingRoom.hostUid
        : existingRoom.hostUid;
    const updatedRoom = await this.collection.findOneAndUpdate(
      { roomCode, status: "waiting" },
      {
        $set: {
          hostUid: nextHostUid,
          participants: nextParticipants,
          updatedAt: new Date()
        }
      } as UpdateFilter<RoomDocument>,
      { returnDocument: "after" }
    );

    return updatedRoom ? mapRoomDocumentToDetail(updatedRoom) : null;
  }
}

export function createMongoRoomRepository(
  collection: Collection<RoomDocument>
): MongoRoomRepository {
  return new MongoRoomRepository(collection);
}

export async function ensureRoomIndexes(
  collection: RoomCollection
): Promise<void> {
  await collection.createIndex({ roomCode: 1 }, { unique: true });
  await collection.createIndex({ hostUid: 1, createdAt: -1 });
  await collection.createIndex({ status: 1, updatedAt: -1 });
}

export function mapRoomDocumentToDetail(document: RoomDocument): RoomDetail {
  const participants: RoomParticipant[] = document.participants.map(
    (participant) => ({
      firebaseUid: participant.firebaseUid,
      nickname: participant.nickname,
      avatarUrl: participant.avatarUrl,
      isHost: participant.firebaseUid === document.hostUid,
      ...(participant.isSpectator === true ? { isSpectator: true } : {}),
      joinedAt: participant.joinedAt.toISOString()
    })
  );

  return {
    roomCode: document.roomCode,
    title: document.title,
    status: document.status,
    hostUid: document.hostUid,
    settings: document.settings,
    participantCount: participants.length,
    maxPlayers: document.settings.maxPlayers,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    participants,
    currentRoundIndex: document.currentRoundIndex
  };
}

function hasParticipant(
  document: RoomDocument,
  firebaseUid: string
): boolean {
  return document.participants.some(
    (participant) => participant.firebaseUid === firebaseUid
  );
}

function countActiveParticipants(document: RoomDocument): number {
  return document.participants.filter(
    (participant) => participant.isSpectator !== true
  ).length;
}

function createJoinRoomFilter(
  roomCode: string,
  firebaseUid: string,
  enforceMaxPlayers: boolean
): Filter<RoomDocument> {
  const filter: Record<string, unknown> = {
    roomCode,
    "participants.firebaseUid": { $ne: firebaseUid }
  };

  if (enforceMaxPlayers) {
    filter.$expr = {
      $lt: [
        {
          $size: {
            $filter: {
              input: "$participants",
              as: "participant",
              cond: { $ne: ["$$participant.isSpectator", true] }
            }
          }
        },
        "$settings.maxPlayers"
      ]
    };
  }

  return filter as Filter<RoomDocument>;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === DUPLICATE_KEY_ERROR_CODE
  );
}

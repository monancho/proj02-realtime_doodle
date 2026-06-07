import type { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";

import { RoomDomainError } from "./errors";
import {
  ensureRoomIndexes,
  MongoRoomRepository,
  type RoomCollection,
  type RoomDocument
} from "./mongodb-room-repository";

const settings = {
  roundDurationSec: 60,
  maxPlayers: 4,
  maxImagesPerUser: 3
};

describe("MongoRoomRepository", () => {
  it("creates required room indexes", async () => {
    const collection = {
      createIndex: vi.fn().mockResolvedValue("index-name")
    } as unknown as RoomCollection;

    await ensureRoomIndexes(collection);

    expect(collection.createIndex).toHaveBeenCalledWith(
      { roomCode: 1 },
      { unique: true }
    );
    expect(collection.createIndex).toHaveBeenCalledWith({
      hostUid: 1,
      createdAt: -1
    });
    expect(collection.createIndex).toHaveBeenCalledWith({
      status: 1,
      updatedAt: -1
    });
  });

  it("retries duplicate roomCode inserts", async () => {
    const collection = {
      insertOne: vi
        .fn()
        .mockRejectedValueOnce({ code: 11000 })
        .mockResolvedValueOnce({ acknowledged: true })
    } as unknown as RoomCollection;
    const codes = ["DUP001", "OK0001"];
    const repository = new MongoRoomRepository(
      collection,
      () => codes.shift() ?? "UNUSED"
    );

    const room = await repository.createRoom({
      host: {
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: null
      },
      title: "Mongo Room",
      settings
    });

    expect(collection.insertOne).toHaveBeenCalledTimes(2);
    expect(room.roomCode).toBe("OK0001");
    expect(room.participants).toHaveLength(1);
  });

  it("throws ROOM_CODE_COLLISION when all insert attempts collide", async () => {
    const collection = {
      insertOne: vi.fn().mockRejectedValue({ code: 11000 })
    } as unknown as RoomCollection;
    const repository = new MongoRoomRepository(collection, () => "LOCKED");

    await expect(
      repository.createRoom({
        host: {
          firebaseUid: "host-uid",
          nickname: null,
          avatarUrl: null
        },
        title: "Mongo Room",
        settings
      })
    ).rejects.toMatchObject({
      code: "ROOM_CODE_COLLISION"
    });
  });

  it("joins with a conditional update and maps the updated document", async () => {
    const existingRoom = createDocument({
      participants: [
        {
          firebaseUid: "host-uid",
          nickname: "Host",
          avatarUrl: null,
          joinedAt: new Date("2026-06-06T00:00:00.000Z")
        }
      ]
    });
    const updatedRoom = createDocument({
      participants: [
        ...existingRoom.participants,
        {
          firebaseUid: "guest-uid",
          nickname: "Guest",
          avatarUrl: null,
          joinedAt: new Date("2026-06-06T00:00:01.000Z")
        }
      ],
      updatedAt: new Date("2026-06-06T00:00:01.000Z")
    });
    const collection = {
      findOne: vi.fn().mockResolvedValue(existingRoom),
      findOneAndUpdate: vi.fn().mockResolvedValue(updatedRoom)
    } as unknown as RoomCollection;
    const repository = new MongoRoomRepository(collection);

    const room = await repository.joinRoom({
      roomCode: "abc123",
      participant: {
        firebaseUid: "guest-uid",
        nickname: "Guest",
        avatarUrl: null
      }
    });

    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        roomCode: "ABC123",
        "participants.firebaseUid": { $ne: "guest-uid" }
      }),
      expect.objectContaining({
        $push: expect.objectContaining({
          participants: expect.objectContaining({
            firebaseUid: "guest-uid"
          })
        })
      }),
      { returnDocument: "after" }
    );
    expect(room.participantCount).toBe(2);
    expect(room.participants[1]).toEqual({
      firebaseUid: "guest-uid",
      nickname: "Guest",
      avatarUrl: null,
      isHost: false,
      joinedAt: "2026-06-06T00:00:01.000Z"
    });
  });

  it("returns an existing participant without updating", async () => {
    const existingRoom = createDocument({
      participants: [
        {
          firebaseUid: "host-uid",
          nickname: "Host",
          avatarUrl: null,
          joinedAt: new Date("2026-06-06T00:00:00.000Z")
        }
      ]
    });
    const collection = {
      findOne: vi.fn().mockResolvedValue(existingRoom),
      findOneAndUpdate: vi.fn()
    } as unknown as RoomCollection;
    const repository = new MongoRoomRepository(collection);

    const room = await repository.joinRoom({
      roomCode: "ABC123",
      participant: {
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: null
      }
    });

    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(room.participantCount).toBe(1);
  });

  it("updates a participant profile with a positional update", async () => {
    const updatedRoom = createDocument({
      participants: [
        {
          firebaseUid: "host-uid",
          nickname: "Updated Host",
          avatarUrl: "https://example.test/host.png",
          joinedAt: new Date("2026-06-06T00:00:00.000Z")
        }
      ],
      updatedAt: new Date("2026-06-06T00:00:01.000Z")
    });
    const collection = {
      findOneAndUpdate: vi.fn().mockResolvedValue(updatedRoom)
    } as unknown as RoomCollection;
    const repository = new MongoRoomRepository(collection);

    const room = await repository.updateParticipantProfile({
      roomCode: " abc123 ",
      firebaseUid: "host-uid",
      nickname: "Updated Host",
      avatarUrl: "https://example.test/host.png"
    });

    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      {
        roomCode: "ABC123",
        "participants.firebaseUid": "host-uid"
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          "participants.$.nickname": "Updated Host",
          "participants.$.avatarUrl": "https://example.test/host.png",
          updatedAt: expect.any(Date)
        })
      }),
      { returnDocument: "after" }
    );
    expect(room?.participants[0]).toMatchObject({
      firebaseUid: "host-uid",
      nickname: "Updated Host",
      avatarUrl: "https://example.test/host.png"
    });
  });

  it("rejects joins for a missing room", async () => {
    const collection = {
      findOne: vi.fn().mockResolvedValue(null)
    } as unknown as RoomCollection;
    const repository = new MongoRoomRepository(collection);

    await expect(
      repository.joinRoom({
        roomCode: "NONE01",
        participant: {
          firebaseUid: "guest-uid",
          nickname: null,
          avatarUrl: null
        }
      })
    ).rejects.toBeInstanceOf(RoomDomainError);
  });
});

function createDocument(
  override: Partial<RoomDocument> = {}
): RoomDocument & { _id: ObjectId } {
  return {
    _id: "object-id" as unknown as ObjectId,
    roomCode: "ABC123",
    title: "Mongo Room",
    hostUid: "host-uid",
    status: "waiting",
    currentRoundIndex: 0,
    settings,
    participants: [],
    createdAt: new Date("2026-06-06T00:00:00.000Z"),
    updatedAt: new Date("2026-06-06T00:00:00.000Z"),
    ...override
  };
}

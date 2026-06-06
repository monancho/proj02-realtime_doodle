import type { RoomDetail, RoomSettings } from "@doodle/shared";
import { describe, expect, it } from "vitest";

import { RoomDomainError } from "./errors";
import { InMemoryRoomRepository } from "./in-memory-room-repository";

const roomSettings: RoomSettings = {
  roundDurationSec: 60,
  maxPlayers: 2,
  maxImagesPerUser: 3
};

const host = {
  firebaseUid: "host-uid",
  nickname: "Host",
  avatarUrl: null
};

describe("InMemoryRoomRepository", () => {
  it("creates a room with the generated roomCode and host participant", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "abc123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });

    const room = await repository.createRoom({
      host,
      title: "Doodle Room",
      settings: roomSettings
    });

    expect(room).toEqual({
      roomCode: "ABC123",
      title: "Doodle Room",
      status: "waiting",
      hostUid: "host-uid",
      settings: roomSettings,
      participantCount: 1,
      maxPlayers: 2,
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
      participants: [
        {
          firebaseUid: "host-uid",
          nickname: "Host",
          avatarUrl: null,
          isHost: true,
          joinedAt: "2026-06-06T00:00:00.000Z"
        }
      ],
      currentRoundIndex: 0
    });
  });

  it("retries roomCode collisions and stores the first free code", async () => {
    const codes = ["SAME01", "SAME01", "FREE01"];
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => codes.shift() ?? "UNUSED",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });

    await repository.createRoom({ host, title: "First", settings: roomSettings });
    const room = await repository.createRoom({
      host: { ...host, firebaseUid: "second-host" },
      title: "Second",
      settings: roomSettings
    });

    expect(room.roomCode).toBe("FREE01");
  });

  it("throws ROOM_CODE_COLLISION after five collisions", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "LOCKED",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });

    await repository.createRoom({ host, title: "First", settings: roomSettings });

    await expect(
      repository.createRoom({
        host: { ...host, firebaseUid: "second-host" },
        title: "Second",
        settings: roomSettings
      })
    ).rejects.toMatchObject({
      code: "ROOM_CODE_COLLISION"
    });
  });

  it("finds a room by normalized roomCode", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });

    await repository.createRoom({ host, title: "Find Me", settings: roomSettings });

    await expect(repository.findRoomByCode(" abc123 ")).resolves.toMatchObject({
      roomCode: "ABC123",
      title: "Find Me"
    });
    await expect(repository.findRoomByCode("missing")).resolves.toBeNull();
  });

  it("joins a waiting room and does not duplicate existing participants", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: createClock([
        "2026-06-06T00:00:00.000Z",
        "2026-06-06T00:00:01.000Z"
      ])
    });
    await repository.createRoom({ host, title: "Join Me", settings: roomSettings });

    const joinedRoom = await repository.joinRoom({
      roomCode: "abc123",
      participant: {
        firebaseUid: "guest-uid",
        nickname: "Guest",
        avatarUrl: "https://example.test/avatar.png"
      }
    });
    const joinedAgainRoom = await repository.joinRoom({
      roomCode: "ABC123",
      participant: {
        firebaseUid: "guest-uid",
        nickname: "Guest",
        avatarUrl: "https://example.test/avatar.png"
      }
    });

    expect(joinedRoom.participantCount).toBe(2);
    expect(joinedRoom.participants).toContainEqual({
      firebaseUid: "guest-uid",
      nickname: "Guest",
      avatarUrl: "https://example.test/avatar.png",
      isHost: false,
      joinedAt: "2026-06-06T00:00:01.000Z"
    });
    expect(joinedAgainRoom.participantCount).toBe(2);
  });

  it("updates participant profile without changing membership", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: createClock([
        "2026-06-06T00:00:00.000Z",
        "2026-06-06T00:00:01.000Z",
        "2026-06-06T00:00:02.000Z"
      ])
    });
    await repository.createRoom({ host, title: "Profile Room", settings: roomSettings });
    await repository.joinRoom({
      roomCode: "ABC123",
      participant: createActor("guest-uid")
    });

    const updatedRoom = await repository.updateParticipantProfile({
      roomCode: " abc123 ",
      firebaseUid: "guest-uid",
      nickname: "Updated Guest",
      avatarUrl: "https://example.test/guest.png"
    });

    expect(updatedRoom?.participantCount).toBe(2);
    expect(updatedRoom?.updatedAt).toBe("2026-06-06T00:00:02.000Z");
    expect(updatedRoom?.participants).toContainEqual({
      firebaseUid: "guest-uid",
      nickname: "Updated Guest",
      avatarUrl: "https://example.test/guest.png",
      isHost: false,
      joinedAt: "2026-06-06T00:00:01.000Z"
    });
    await expect(
      repository.updateParticipantProfile({
        roomCode: "ABC123",
        firebaseUid: "missing-uid",
        nickname: "Nobody",
        avatarUrl: null
      })
    ).resolves.toBeNull();
  });

  it("rejects joins for missing, full, and already-started rooms", async () => {
    const fullRoom = createRoomFixture({
      roomCode: "FULL01",
      status: "waiting",
      participants: [
        createParticipant("host-uid", true),
        createParticipant("guest-uid", false)
      ]
    });
    const playingRoom = createRoomFixture({
      roomCode: "PLAY01",
      status: "playing",
      participants: [createParticipant("host-uid", true)]
    });
    const repository = new InMemoryRoomRepository({
      initialRooms: [fullRoom, playingRoom]
    });

    await expect(
      repository.joinRoom({
        roomCode: "NONE01",
        participant: createActor("new-uid")
      })
    ).rejects.toBeInstanceOf(RoomDomainError);
    await expect(
      repository.joinRoom({
        roomCode: "FULL01",
        participant: createActor("new-uid")
      })
    ).rejects.toMatchObject({ code: "ROOM_FULL" });
    await expect(
      repository.joinRoom({
        roomCode: "PLAY01",
        participant: createActor("new-uid")
      })
    ).rejects.toMatchObject({ code: "ROOM_ALREADY_STARTED" });
  });
});

function createClock(values: string[]): () => Date {
  return () => new Date(values.shift() ?? "2026-06-06T00:00:59.000Z");
}

function createActor(firebaseUid: string) {
  return {
    firebaseUid,
    nickname: null,
    avatarUrl: null
  };
}

function createParticipant(firebaseUid: string, isHost: boolean) {
  return {
    firebaseUid,
    nickname: null,
    avatarUrl: null,
    isHost,
    joinedAt: "2026-06-06T00:00:00.000Z"
  };
}

function createRoomFixture(
  override: Pick<RoomDetail, "roomCode" | "status" | "participants">
): RoomDetail {
  return {
    roomCode: override.roomCode,
    title: "Fixture Room",
    status: override.status,
    hostUid: "host-uid",
    settings: roomSettings,
    participantCount: override.participants.length,
    maxPlayers: roomSettings.maxPlayers,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    participants: override.participants,
    currentRoundIndex: 0
  };
}

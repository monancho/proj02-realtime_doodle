import type { AuthContext, RoomDetail, RoomSettings } from "@doodle/shared";
import type { Server, Socket } from "socket.io";
import { describe, expect, it, vi } from "vitest";

import { InMemoryRoomRepository } from "../rooms/in-memory-room-repository";
import {
  createSocketRoomName,
  handleJoinRoom,
  handleLeaveRoom
} from "./rooms";

const roomSettings: RoomSettings = {
  roundDurationSec: 60,
  maxPlayers: 4,
  maxImagesPerUser: 3
};

const hostAuth: AuthContext = {
  user: {
    firebaseUid: "host-uid",
    email: "host@example.com",
    nickname: "Host",
    avatarUrl: null
  }
};

const guestAuth: AuthContext = {
  user: {
    firebaseUid: "guest-uid",
    email: "guest@example.com",
    nickname: "Guest",
    avatarUrl: null
  }
};

describe("room membership socket handlers", () => {
  it("joins a socket room and emits room-updated for an existing participant", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    const room = await createRoom(repository);
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleJoinRoom({ io, repository, socket }, { roomCode: " abc123 " });

    expect(socket.join).toHaveBeenCalledWith("room:ABC123");
    expect(socket.emit).not.toHaveBeenCalledWith(
      "socket-error",
      expect.anything()
    );
    expect(io.to).toHaveBeenCalledWith("room:ABC123");
    expect(io.emitToRoom).toHaveBeenCalledWith("room-updated", { room });
  });

  it("handles duplicate join-room idempotently", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    await createRoom(repository);
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleJoinRoom({ io, repository, socket }, { roomCode: "ABC123" });
    await handleJoinRoom({ io, repository, socket }, { roomCode: "ABC123" });

    expect(socket.join).toHaveBeenCalledTimes(2);
    expect(socket.emit).not.toHaveBeenCalledWith(
      "socket-error",
      expect.anything()
    );
    expect(io.emitToRoom).toHaveBeenCalledTimes(2);
  });

  it("rejects join-room when the auth user is not a participant", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123"
    });
    await createRoom(repository);
    const socket = createMockSocket(guestAuth);
    const io = createMockIo();

    await handleJoinRoom({ io, repository, socket }, { roomCode: "ABC123" });

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_ACCESS_DENIED" })
    );
  });

  it("rejects join-room for missing rooms and invalid payloads", async () => {
    const repository = new InMemoryRoomRepository();
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleJoinRoom({ io, repository, socket }, { roomCode: "NONE01" });
    await handleJoinRoom({ io, repository, socket }, { roomCode: " " });

    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_NOT_FOUND" })
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_PAYLOAD_INVALID" })
    );
  });

  it("rejects join-room without authenticated socket context", async () => {
    const repository = new InMemoryRoomRepository();
    const socket = createMockSocket(undefined);
    const io = createMockIo();

    await handleJoinRoom({ io, repository, socket }, { roomCode: "ABC123" });

    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "AUTH_TOKEN_MISSING" })
    );
  });

  it("leaves a socket room and emits room-updated without removing participants", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    const room = await createRoom(repository);
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleLeaveRoom({ io, repository, socket }, { roomCode: "abc123" });
    const persistedRoom = await repository.findRoomByCode("ABC123");

    expect(socket.leave).toHaveBeenCalledWith("room:ABC123");
    expect(io.emitToRoom).toHaveBeenCalledWith("room-updated", { room });
    expect(persistedRoom?.participantCount).toBe(1);
  });

  it("returns ROOM_NOT_FOUND when leave-room cannot find the room", async () => {
    const repository = new InMemoryRoomRepository();
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleLeaveRoom({ io, repository, socket }, { roomCode: "NONE01" });

    expect(socket.leave).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_NOT_FOUND" })
    );
  });

  it("creates normalized socket room names", () => {
    expect(createSocketRoomName(" abc123 ")).toBe("room:ABC123");
  });
});

async function createRoom(
  repository: InMemoryRoomRepository
): Promise<RoomDetail> {
  return repository.createRoom({
    host: {
      firebaseUid: "host-uid",
      nickname: "Host",
      avatarUrl: null
    },
    title: "Socket Room",
    settings: roomSettings
  });
}

function createMockSocket(
  auth: AuthContext | undefined
): Pick<Socket, "data" | "emit" | "join" | "leave"> {
  return {
    data: auth ? { auth } : {},
    emit: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined)
  } as unknown as Pick<Socket, "data" | "emit" | "join" | "leave">;
}

function createMockIo(): Pick<Server, "to"> & {
  emitToRoom: ReturnType<typeof vi.fn>;
} {
  const emitToRoom = vi.fn();

  return {
    emitToRoom,
    to: vi.fn().mockReturnValue({ emit: emitToRoom })
  } as unknown as Pick<Server, "to"> & {
    emitToRoom: ReturnType<typeof vi.fn>;
  };
}

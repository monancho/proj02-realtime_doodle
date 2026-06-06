import type { AuthContext, RoomDetail, RoomSettings } from "@doodle/shared";
import type { Server, Socket } from "socket.io";
import { describe, expect, it, vi } from "vitest";

import { InMemoryRoomRepository } from "../rooms/in-memory-room-repository";
import {
  createSocketRoomName,
  handleDrawStroke,
  handleJoinRoom,
  handleLeaveRoom,
  handleSendMessage,
  type DrawStroke,
  RecentChatMessageStore,
  RecentStrokeBatchStore
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

  it("broadcasts trimmed chat messages to the matching socket room", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123"
    });
    await createRoom(repository);
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();
    const recentMessages = new RecentChatMessageStore();

    await handleSendMessage(
      createChatDependencies({ io, repository, socket, recentMessages }),
      { roomCode: " abc123 ", message: " hello room " }
    );

    const expectedMessage = {
      roomCode: "ABC123",
      type: "chat",
      firebaseUid: "host-uid",
      nickname: "Host",
      avatarUrl: null,
      message: "hello room",
      createdAt: "2026-06-06T00:00:00.000Z"
    };

    expect(io.to).toHaveBeenCalledWith("room:ABC123");
    expect(io.emitToRoom).toHaveBeenCalledWith(
      "receive-message",
      expectedMessage
    );
    expect(recentMessages.list("abc123")).toEqual([expectedMessage]);
  });

  it("rejects send-message without authenticated socket context", async () => {
    const repository = new InMemoryRoomRepository();
    const socket = createMockSocket(undefined);
    const io = createMockIo();

    await handleSendMessage(createChatDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      message: "hello"
    });

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "AUTH_TOKEN_MISSING" })
    );
  });

  it("rejects invalid, empty, and too-long chat messages", async () => {
    const repository = new InMemoryRoomRepository();
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleSendMessage(createChatDependencies({ io, repository, socket }), {
      roomCode: "ABC123"
    });
    await handleSendMessage(createChatDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      message: "   "
    });
    await handleSendMessage(createChatDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      message: "a".repeat(201)
    });

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "CHAT_PAYLOAD_INVALID" })
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "CHAT_MESSAGE_EMPTY" })
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "CHAT_MESSAGE_TOO_LONG" })
    );
  });

  it("rejects send-message for missing rooms and non-participants", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123"
    });
    await createRoom(repository);
    const socket = createMockSocket(guestAuth);
    const io = createMockIo();

    await handleSendMessage(createChatDependencies({ io, repository, socket }), {
      roomCode: "NONE01",
      message: "hello"
    });
    await handleSendMessage(createChatDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      message: "hello"
    });

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_NOT_FOUND" })
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_ACCESS_DENIED" })
    );
  });

  it("keeps only the latest 50 recent chat messages per room", async () => {
    const recentMessages = new RecentChatMessageStore();

    for (let index = 0; index < 51; index += 1) {
      recentMessages.append({
        roomCode: "ABC123",
        type: "chat",
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: null,
        message: `message-${index}`,
        createdAt: new Date(index).toISOString()
      });
    }

    const messages = recentMessages.list("abc123");

    expect(messages).toHaveLength(50);
    expect(messages[0]?.message).toBe("message-1");
    expect(messages[49]?.message).toBe("message-50");
  });

  it("broadcasts valid drawing strokes to the matching socket room", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123"
    });
    await createRoom(repository);
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();
    const recentStrokeBatches = new RecentStrokeBatchStore();

    await handleDrawStroke(
      createDrawingDependencies({
        io,
        repository,
        socket,
        recentStrokeBatches
      }),
      {
        roomCode: " abc123 ",
        roundId: " round-1 ",
        stroke: {
          strokeId: " stroke-1 ",
          tool: "pen",
          color: "#1A2b3C",
          width: 8,
          points: [
            { x: 0, y: 0.25, pressure: 0.5, t: 1 },
            { x: 1, y: 0.75, pressure: null, t: null }
          ]
        }
      }
    );

    const expectedStrokeBatch = {
      roomCode: "ABC123",
      roundId: "round-1",
      stroke: {
        strokeId: "stroke-1",
        tool: "pen",
        color: "#1A2b3C",
        width: 8,
        points: [
          { x: 0, y: 0.25, pressure: 0.5, t: 1 },
          { x: 1, y: 0.75, pressure: null, t: null }
        ]
      },
      firebaseUid: "host-uid",
      createdAt: "2026-06-06T00:00:00.000Z"
    };

    expect(io.to).toHaveBeenCalledWith("room:ABC123");
    expect(io.emitToRoom).toHaveBeenCalledWith(
      "draw-stroke",
      expectedStrokeBatch
    );
    expect(recentStrokeBatches.list("abc123", " round-1 ")).toEqual([
      expectedStrokeBatch
    ]);
  });

  it("rejects draw-stroke without authenticated socket context", async () => {
    const repository = new InMemoryRoomRepository();
    const socket = createMockSocket(undefined);
    const io = createMockIo();

    await handleDrawStroke(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      roundId: "round-1",
      stroke: createValidStroke()
    });

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "AUTH_TOKEN_MISSING" })
    );
  });

  it("rejects invalid draw-stroke payloads", async () => {
    const repository = new InMemoryRoomRepository();
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleDrawStroke(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      roundId: "round-1",
      stroke: { ...createValidStroke(), points: [] }
    });
    await handleDrawStroke(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      roundId: "round-1",
      stroke: {
        ...createValidStroke(),
        points: Array.from({ length: 129 }, () => ({ x: 0.5, y: 0.5 }))
      }
    });
    await handleDrawStroke(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      roundId: "round-1",
      stroke: { ...createValidStroke(), points: [{ x: 1.1, y: 0.5 }] }
    });
    await handleDrawStroke(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      roundId: "round-1",
      stroke: { ...createValidStroke(), color: "red" }
    });

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledTimes(4);
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "DRAW_PAYLOAD_INVALID" })
    );
  });

  it("rejects draw-stroke for missing rooms and non-participants", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123"
    });
    await createRoom(repository);
    const socket = createMockSocket(guestAuth);
    const io = createMockIo();

    await handleDrawStroke(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "NONE01",
      roundId: "round-1",
      stroke: createValidStroke()
    });
    await handleDrawStroke(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      roundId: "round-1",
      stroke: createValidStroke()
    });

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_NOT_FOUND" })
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_ACCESS_DENIED" })
    );
  });

  it("keeps only the latest 200 recent stroke batches per room and round", () => {
    const recentStrokeBatches = new RecentStrokeBatchStore();

    for (let index = 0; index < 201; index += 1) {
      recentStrokeBatches.append({
        roomCode: "ABC123",
        roundId: "round-1",
        stroke: {
          ...createValidStroke(),
          strokeId: `stroke-${index}`
        },
        firebaseUid: "host-uid",
        createdAt: new Date(index).toISOString()
      });
    }

    const strokeBatches = recentStrokeBatches.list("abc123", " round-1 ");

    expect(strokeBatches).toHaveLength(200);
    expect(strokeBatches[0]?.stroke.strokeId).toBe("stroke-1");
    expect(strokeBatches[199]?.stroke.strokeId).toBe("stroke-200");
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

function createChatDependencies({
  io,
  repository,
  socket,
  recentMessages = new RecentChatMessageStore()
}: {
  io: Pick<Server, "to">;
  repository: InMemoryRoomRepository;
  socket: Pick<Socket, "data" | "emit" | "join" | "leave">;
  recentMessages?: RecentChatMessageStore;
}) {
  return {
    io,
    repository,
    socket,
    recentMessages,
    now: () => new Date("2026-06-06T00:00:00.000Z")
  };
}

function createDrawingDependencies({
  io,
  repository,
  socket,
  recentStrokeBatches = new RecentStrokeBatchStore()
}: {
  io: Pick<Server, "to">;
  repository: InMemoryRoomRepository;
  socket: Pick<Socket, "data" | "emit" | "join" | "leave">;
  recentStrokeBatches?: RecentStrokeBatchStore;
}) {
  return {
    io,
    repository,
    socket,
    recentStrokeBatches,
    now: () => new Date("2026-06-06T00:00:00.000Z")
  };
}

function createValidStroke(): DrawStroke {
  return {
    strokeId: "stroke-1",
    tool: "pen",
    color: "#123ABC",
    width: 4,
    points: [{ x: 0.5, y: 0.5 }]
  };
}

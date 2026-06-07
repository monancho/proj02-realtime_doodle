import type {
  AuthContext,
  ImageMetadata,
  RoomDetail,
  RoomSettings
} from "@doodle/shared";
import type { Server, Socket } from "socket.io";
import { describe, expect, it, vi } from "vitest";

import { InMemoryImageRepository } from "../images/in-memory-image-repository";
import { ResultSaveService } from "../results/service";
import { InMemoryRoomRepository } from "../rooms/in-memory-room-repository";
import { InMemoryUserRepository } from "../users/in-memory-user-repository";
import {
  createSocketRoomName,
  handleCursorMove,
  handleDrawStroke,
  handleGameCountdownExpired,
  handleJoinRoom,
  handleLeaveRoom,
  handlePrepareNextGame,
  handleProfileUpdated,
  handleRoundTimerExpired,
  handleSendMessage,
  handleStartGame,
  type DrawStroke,
  RecentChatMessageStore,
  RecentStrokeBatchStore,
  RoundRuntimeStateStore
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

  it("replays the active round snapshot and recent strokes when joining during play", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    await createRoom(repository);
    await repository.startGame({ roomCode: "ABC123" });
    const room = await repository.beginGame({ roomCode: "ABC123" });
    const roundState = new RoundRuntimeStateStore();
    const recentStrokeBatches = new RecentStrokeBatchStore();
    const image = createImageMetadata({ id: "image-current" });
    const activeRound = {
      roomCode: room.roomCode,
      roundId: "round-current",
      roundIndex: room.currentRoundIndex,
      image,
      durationSec: 60,
      startedAt: "2026-06-06T00:00:10.000Z"
    };
    roundState.startRound(activeRound);
    recentStrokeBatches.append({
      roomCode: room.roomCode,
      roundId: activeRound.roundId,
      stroke: createValidStroke(),
      firebaseUid: "host-uid",
      createdAt: "2026-06-06T00:00:11.000Z"
    });
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleJoinRoom(
      { io, repository, socket, recentStrokeBatches, roundState },
      { roomCode: "ABC123" }
    );

    expect(socket.join).toHaveBeenCalledWith("room:ABC123");
    expect(socket.emit).toHaveBeenCalledWith("round-started", activeRound);
    expect(socket.emit).toHaveBeenCalledWith(
      "draw-stroke",
      expect.objectContaining({
        roomCode: "ABC123",
        roundId: "round-current"
      })
    );
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

  it("removes a waiting participant when leaving the socket room", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    await createRoom(repository);
    const imageRepository = new InMemoryImageRepository({
      initialImages: [createImageMetadata({ id: "image-host" })]
    });
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleLeaveRoom(
      { io, imageRepository, repository, socket },
      { roomCode: "abc123" }
    );
    const persistedRoom = await repository.findRoomByCode("ABC123");
    const activeImages = await imageRepository.listImagesByRoomCode("ABC123");

    expect(socket.leave).toHaveBeenCalledWith("room:ABC123");
    expect(io.emitToRoom).toHaveBeenCalledWith("room-updated", {
      room: expect.objectContaining({
        participantCount: 0,
        participants: []
      })
    });
    expect(persistedRoom?.participantCount).toBe(0);
    expect(activeImages).toHaveLength(0);
  });

  it("keeps participants when leaving during an active game", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    await createRoom(repository);
    await repository.startGame({ roomCode: "ABC123" });
    const room = await repository.beginGame({ roomCode: "ABC123" });
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

  it("updates participant profile from the user repository and emits room-updated", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: () => new Date("2026-06-06T00:00:00.000Z")
    });
    const userRepository = new InMemoryUserRepository();
    await createRoom(repository);
    await userRepository.upsertByFirebaseUid({
      firebaseUid: "host-uid",
      email: "host@example.com",
      nickname: "Updated Host",
      avatarUrl: "https://example.test/updated.png"
    });
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleProfileUpdated(
      { io, repository, socket, userRepository },
      { roomCode: " abc123 " }
    );

    expect(socket.emit).not.toHaveBeenCalledWith(
      "socket-error",
      expect.anything()
    );
    expect(io.emitToRoom).toHaveBeenCalledWith("room-updated", {
      room: expect.objectContaining({
        participants: expect.arrayContaining([
          expect.objectContaining({
            firebaseUid: "host-uid",
            nickname: "Updated Host",
            avatarUrl: "https://example.test/updated.png"
          })
        ])
      })
    });
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
      initialRooms: [createRoomDetail({ status: "playing" })]
    });
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();
    const recentStrokeBatches = new RecentStrokeBatchStore();
    const roundState = new RoundRuntimeStateStore();
    roundState.startRound({
      roomCode: "ABC123",
      roundId: "round-1",
      roundIndex: 0,
      image: createImageMetadata({ id: "image-current" })
    });

    await handleDrawStroke(
      createDrawingDependencies({
        io,
        repository,
        socket,
        recentStrokeBatches,
        roundState
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

  it("broadcasts cursor-move for participants in the active round", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "playing" })]
    });
    const io = createMockIo();
    const socket = createMockSocket(hostAuth);
    const roundState = new RoundRuntimeStateStore();
    roundState.startRound({
      roomCode: "ABC123",
      roundId: "round-1",
      roundIndex: 0,
      image: createImageMetadata({ id: "image-current" })
    });

    await handleCursorMove(
      createDrawingDependencies({ io, repository, socket, roundState }),
      {
        roomCode: " abc123 ",
        roundId: " round-1 ",
        x: 0.25,
        y: 0.75,
        tool: "pen",
        color: "#123ABC",
        width: 6
      }
    );

    expect(io.to).toHaveBeenCalledWith("room:ABC123");
    expect(io.emitToRoom).toHaveBeenCalledWith("cursor-move", {
      roomCode: "ABC123",
      roundId: "round-1",
      x: 0.25,
      y: 0.75,
      tool: "pen",
      color: "#123ABC",
      width: 6,
      firebaseUid: "host-uid",
      nickname: "Host",
      avatarUrl: null,
      updatedAt: "2026-06-06T00:00:00.000Z"
    });
  });

  it("rejects invalid cursor-move payloads", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "playing" })]
    });
    const io = createMockIo();
    const socket = createMockSocket(hostAuth);

    await handleCursorMove(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      roundId: "round-1",
      x: 1.1,
      y: 0.5,
      tool: "pen",
      color: "#123ABC",
      width: 6
    });
    await handleCursorMove(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      roundId: "round-1",
      x: 0.5,
      y: 0.5,
      tool: "brush",
      color: "#123ABC",
      width: 6
    });

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "CURSOR_PAYLOAD_INVALID" })
    );
  });

  it("rejects draw-stroke for ended rounds", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "playing" })]
    });
    const roundState = new RoundRuntimeStateStore();
    roundState.closeRound("ABC123", "round-1");
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleDrawStroke(
      createDrawingDependencies({ io, repository, socket, roundState }),
      {
        roomCode: "ABC123",
        roundId: "round-1",
        stroke: createValidStroke()
      }
    );

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "DRAW_ROUND_CLOSED" })
    );
  });

  it("rejects draw-stroke when the room is not playing", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123"
    });
    await createRoom(repository);
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleDrawStroke(createDrawingDependencies({ io, repository, socket }), {
      roomCode: "ABC123",
      roundId: "round-1",
      stroke: createValidStroke()
    });

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_STATE_INVALID" })
    );
  });

  it("rejects draw-stroke from spectators while still allowing room membership", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [
        {
          ...createRoomDetail({ status: "playing" }),
          participants: [
            {
              firebaseUid: "spectator-uid",
              nickname: "Spectator",
              avatarUrl: null,
              isHost: false,
              isSpectator: true,
              joinedAt: "2026-06-06T00:00:02.000Z"
            }
          ]
        }
      ]
    });
    const io = createMockIo();
    const socket = createMockSocket({
      user: {
        firebaseUid: "spectator-uid",
        email: "spectator@example.com",
        nickname: "Spectator",
        avatarUrl: null
      }
    });

    await handleDrawStroke(
      createDrawingDependencies({ io, repository, socket }),
      {
        roomCode: "ABC123",
        roundId: "round-1",
        stroke: createValidStroke()
      }
    );

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_SPECTATOR_DRAWING_DENIED" })
    );
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

  it("keeps only the latest 10000 recent stroke batches per room and round", () => {
    const recentStrokeBatches = new RecentStrokeBatchStore();

    for (let index = 0; index < 10001; index += 1) {
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

    expect(strokeBatches).toHaveLength(10000);
    expect(strokeBatches[0]?.stroke.strokeId).toBe("stroke-1");
    expect(strokeBatches[9999]?.stroke.strokeId).toBe("stroke-10000");
  });

  it("moves a ready room to starting and emits game-starting before the first round", async () => {
    const repository = new InMemoryRoomRepository({
      roomCodeGenerator: () => "ABC123",
      now: createClock([
        "2026-06-06T00:00:00.000Z",
        "2026-06-06T00:00:01.000Z"
      ])
    });
    await createRoom(repository);
    const imageRepository = new InMemoryImageRepository({
      initialImages: [
        createImageMetadata({ id: "image-1" }),
        createImageMetadata({ id: "image-2" })
      ]
    });
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();
    const timerScheduler = createMockTimerScheduler();

    await handleStartGame(
      createRoundDependencies({
        io,
        repository,
        imageRepository,
        socket,
        selectImage: (images) => images[1] ?? images[0],
        timerScheduler
      }),
      { roomCode: " abc123 " }
    );

    const usedImage = await imageRepository.findImageById("image-2");
    const room = await repository.findRoomByCode("ABC123");

    expect(usedImage?.used).toBe(false);
    expect(room).toMatchObject({
      status: "starting",
      currentRoundIndex: 0
    });
    expect(io.to).toHaveBeenCalledWith("room:ABC123");
    expect(io.emitToRoom).toHaveBeenCalledWith("game-starting", {
      roomCode: "ABC123",
      countdownSec: 5,
      startsAt: "2026-06-06T00:00:07.000Z",
      room: expect.objectContaining({
        status: "starting",
        currentRoundIndex: 0
      })
    });
    expect(io.emitToRoom).toHaveBeenCalledWith(
      "room-updated",
      expect.objectContaining({
        room: expect.objectContaining({
          status: "starting",
          currentRoundIndex: 0
        })
      })
    );
    expect(timerScheduler.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        roomCode: "ABC123",
        roundId: "game-starting",
        durationSec: 5
      })
    );
  });

  it("starts the first round after the game-starting countdown expires", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "starting" })],
      now: () => new Date("2026-06-06T00:00:05.000Z")
    });
    const imageRepository = new InMemoryImageRepository({
      initialImages: [
        createImageMetadata({ id: "image-1" }),
        createImageMetadata({ id: "image-2" })
      ]
    });
    const io = createMockIo();
    const timerScheduler = createMockTimerScheduler();
    const roundState = new RoundRuntimeStateStore();

    await handleGameCountdownExpired(
      createTimerDependencies({
        io,
        repository,
        imageRepository,
        roundState,
        timerScheduler,
        selectImage: (images) => images[1] ?? images[0],
        roundIdGenerator: () => "round-test",
        now: () => new Date("2026-06-06T00:00:07.000Z")
      }),
      "ABC123"
    );

    const usedImage = await imageRepository.findImageById("image-2");
    const room = await repository.findRoomByCode("ABC123");

    expect(usedImage?.used).toBe(true);
    expect(room).toMatchObject({
      status: "playing",
      currentRoundIndex: 0
    });
    expect(io.emitToRoom).toHaveBeenCalledWith("round-started", {
      roomCode: "ABC123",
      roundId: "round-test",
      roundIndex: 0,
      image: usedImage,
      durationSec: 60,
      startedAt: "2026-06-06T00:00:07.000Z"
    });
    expect(timerScheduler.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        roomCode: "ABC123",
        roundId: "round-test",
        durationSec: 60
      })
    );
  });

  it("ends a round and finishes the game when no unused images remain", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "playing" })],
      now: () => new Date("2026-06-06T00:01:02.000Z")
    });
    const imageRepository = new InMemoryImageRepository();
    const io = createMockIo();
    const roundState = new RoundRuntimeStateStore();
    const resultSaveService = createMockResultSaveService({
      roomCode: "ABC123",
      roundId: "round-1",
      roundIndex: 0
    });
    const activeRound = {
      roomCode: "ABC123",
      roundId: "round-1",
      roundIndex: 0,
      image: createImageMetadata({ id: "image-used" })
    };
    roundState.startRound(activeRound);

    await handleRoundTimerExpired(
      createTimerDependencies({
        io,
        repository,
        imageRepository,
        roundState,
        resultSaveService,
        now: createClock([
          "2026-06-06T00:01:00.000Z",
          "2026-06-06T00:01:01.000Z"
        ])
      }),
      activeRound
    );

    const room = await repository.findRoomByCode("ABC123");

    expect(room?.status).toBe("finished");
    expect(io.emitToRoom).toHaveBeenCalledWith("round-ended", {
      roomCode: "ABC123",
      roundId: "round-1",
      roundIndex: 0,
      image: activeRound.image,
      endedAt: "2026-06-06T00:01:00.000Z"
    });
    expect(resultSaveService.saveRoundResult).toHaveBeenCalledWith({
      round: expect.objectContaining({
        roomCode: "ABC123",
        roundId: "round-1"
      }),
      strokes: []
    });
    expect(io.emitToRoom).toHaveBeenCalledWith(
      "result-saved",
      expect.objectContaining({
        roomCode: "ABC123",
        roundId: "round-1",
        result: expect.objectContaining({ id: "result-round-1" })
      })
    );
    expect(io.emitToRoom).toHaveBeenCalledWith(
      "game-finished",
      expect.objectContaining({
        roomCode: "ABC123",
        finishedAt: "2026-06-06T00:01:01.000Z",
        room: expect.objectContaining({ status: "finished" })
      })
    );
    expect(io.emitToRoom).toHaveBeenCalledWith(
      "room-updated",
      expect.objectContaining({
        room: expect.objectContaining({ status: "finished" })
      })
    );
  });

  it("ends a round and starts the next round when an unused image remains", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "playing" })],
      now: () => new Date("2026-06-06T00:01:02.000Z")
    });
    const imageRepository = new InMemoryImageRepository({
      initialImages: [createImageMetadata({ id: "image-next" })]
    });
    const io = createMockIo();
    const roundState = new RoundRuntimeStateStore();
    const recentStrokeBatches = new RecentStrokeBatchStore();
    recentStrokeBatches.append({
      roomCode: "ABC123",
      roundId: "round-1",
      stroke: createValidStroke(),
      firebaseUid: "host-uid",
      createdAt: "2026-06-06T00:00:30.000Z"
    });
    const resultSaveService = createMockResultSaveService({
      roomCode: "ABC123",
      roundId: "round-1",
      roundIndex: 0
    });
    const timerScheduler = createMockTimerScheduler();
    const activeRound = {
      roomCode: "ABC123",
      roundId: "round-1",
      roundIndex: 0,
      image: createImageMetadata({ id: "image-used" })
    };
    roundState.startRound(activeRound);

    await handleRoundTimerExpired(
      createTimerDependencies({
        io,
        repository,
        imageRepository,
        recentStrokeBatches,
        roundState,
        resultSaveService,
        timerScheduler,
        roundIdGenerator: () => "round-2",
        now: createClock([
          "2026-06-06T00:01:00.000Z",
          "2026-06-06T00:01:01.000Z"
        ])
      }),
      activeRound
    );

    const room = await repository.findRoomByCode("ABC123");
    const usedImage = await imageRepository.findImageById("image-next");

    expect(room).toMatchObject({
      status: "playing",
      currentRoundIndex: 1
    });
    expect(usedImage?.used).toBe(true);
    expect(resultSaveService.saveRoundResult).toHaveBeenCalledWith({
      round: expect.objectContaining({
        roomCode: "ABC123",
        roundId: "round-1"
      }),
      strokes: [
        expect.objectContaining({
          roomCode: "ABC123",
          roundId: "round-1"
        })
      ]
    });
    expect(io.emitToRoom).toHaveBeenCalledWith(
      "round-started",
      expect.objectContaining({
        roomCode: "ABC123",
        roundId: "round-2",
        roundIndex: 1,
        image: usedImage,
        durationSec: 60,
        startedAt: "2026-06-06T00:01:01.000Z"
      })
    );
    expect(timerScheduler.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        roomCode: "ABC123",
        roundId: "round-2",
        durationSec: 60
      })
    );
  });

  it("continues round transition when result save fails", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "playing" })]
    });
    const imageRepository = new InMemoryImageRepository({
      initialImages: [createImageMetadata({ id: "image-next" })]
    });
    const io = createMockIo();
    const roundState = new RoundRuntimeStateStore();
    const activeRound = {
      roomCode: "ABC123",
      roundId: "round-1",
      roundIndex: 0,
      image: createImageMetadata({ id: "image-used" })
    };
    roundState.startRound(activeRound);

    await handleRoundTimerExpired(
      createTimerDependencies({
        io,
        repository,
        imageRepository,
        roundState,
        resultSaveService: createMockResultSaveService(null),
        roundIdGenerator: () => "round-2",
        now: createClock([
          "2026-06-06T00:01:00.000Z",
          "2026-06-06T00:01:01.000Z"
        ])
      }),
      activeRound
    );

    const room = await repository.findRoomByCode("ABC123");

    expect(room).toMatchObject({
      status: "playing",
      currentRoundIndex: 1
    });
    expect(io.emitToRoom).not.toHaveBeenCalledWith(
      "result-saved",
      expect.anything()
    );
    expect(io.emitToRoom).toHaveBeenCalledWith(
      "round-started",
      expect.objectContaining({ roundId: "round-2" })
    );
  });

  it("prepares a finished room for another game without removing results", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "finished" })],
      now: () => new Date("2026-06-06T00:02:00.000Z")
    });
    const imageRepository = new InMemoryImageRepository({
      initialImages: [
        createImageMetadata({ id: "image-host" }),
        createImageMetadata({
          id: "image-guest",
          firebaseUid: "guest-uid",
          nickname: "Guest"
        })
      ]
    });
    const io = createMockIo();
    const socket = createMockSocket(hostAuth);

    await handlePrepareNextGame(
      createRoundDependencies({
        io,
        repository,
        imageRepository,
        socket
      }),
      { roomCode: "ABC123" }
    );

    const room = await repository.findRoomByCode("ABC123");
    const activeImages = await imageRepository.listImagesByRoomCode("ABC123");
    const oldImage = await imageRepository.findImageById("image-host");

    expect(room).toMatchObject({
      status: "waiting",
      currentRoundIndex: 0
    });
    expect(activeImages).toHaveLength(0);
    expect(oldImage?.active).toBe(false);
    expect(io.emitToRoom).toHaveBeenCalledWith(
      "room-updated",
      expect.objectContaining({
        room: expect.objectContaining({ status: "waiting" })
      })
    );
  });

  it("rejects start-game without auth, invalid payload, and missing rooms", async () => {
    const repository = new InMemoryRoomRepository();
    const imageRepository = new InMemoryImageRepository();
    const io = createMockIo();

    await handleStartGame(
      createRoundDependencies({
        io,
        repository,
        imageRepository,
        socket: createMockSocket(undefined)
      }),
      { roomCode: "ABC123" }
    );
    const socket = createMockSocket(hostAuth);
    await handleStartGame(
      createRoundDependencies({ io, repository, imageRepository, socket }),
      { roomCode: " " }
    );
    await handleStartGame(
      createRoundDependencies({ io, repository, imageRepository, socket }),
      { roomCode: "NONE01" }
    );

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_PAYLOAD_INVALID" })
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_NOT_FOUND" })
    );
  });

  it("rejects start-game for non-hosts, invalid room state, and unready participants", async () => {
    const waitingRepository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "waiting" })]
    });
    const playingRepository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "playing" })]
    });
    const imageRepository = new InMemoryImageRepository();
    const io = createMockIo();
    const nonHostSocket = createMockSocket(guestAuth);
    const hostSocket = createMockSocket(hostAuth);

    await handleStartGame(
      createRoundDependencies({
        io,
        repository: waitingRepository,
        imageRepository,
        socket: nonHostSocket
      }),
      { roomCode: "ABC123" }
    );
    await handleStartGame(
      createRoundDependencies({
        io,
        repository: playingRepository,
        imageRepository,
        socket: hostSocket
      }),
      { roomCode: "ABC123" }
    );
    await handleStartGame(
      createRoundDependencies({
        io,
        repository: waitingRepository,
        imageRepository,
        socket: hostSocket
      }),
      { roomCode: "ABC123" }
    );

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(nonHostSocket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_HOST_REQUIRED" })
    );
    expect(hostSocket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_STATE_INVALID" })
    );
    expect(hostSocket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROOM_PARTICIPANTS_NOT_READY" })
    );
  });

  it("rejects start-game when every participant is ready but no unused images remain", async () => {
    const repository = new InMemoryRoomRepository({
      initialRooms: [createRoomDetail({ status: "waiting" })]
    });
    const imageRepository = new InMemoryImageRepository({
      initialImages: [
        createImageMetadata({ id: "image-host", used: true }),
        createImageMetadata({
          id: "image-guest",
          firebaseUid: "guest-uid",
          nickname: "Guest",
          used: true
        })
      ]
    });
    const socket = createMockSocket(hostAuth);
    const io = createMockIo();

    await handleStartGame(
      createRoundDependencies({
        io,
        repository,
        imageRepository,
        socket
      }),
      { roomCode: "ABC123" }
    );

    expect(io.emitToRoom).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({ code: "ROUND_IMAGE_NOT_FOUND" })
    );
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
  recentStrokeBatches = new RecentStrokeBatchStore(),
  roundState = new RoundRuntimeStateStore()
}: {
  io: Pick<Server, "to">;
  repository: InMemoryRoomRepository;
  socket: Pick<Socket, "data" | "emit" | "join" | "leave">;
  recentStrokeBatches?: RecentStrokeBatchStore;
  roundState?: RoundRuntimeStateStore;
}) {
  return {
    io,
    repository,
    socket,
    recentStrokeBatches,
    roundState,
    now: () => new Date("2026-06-06T00:00:00.000Z")
  };
}

function createRoundDependencies({
  io,
  repository,
  imageRepository,
  socket,
  selectImage = (images: ImageMetadata[]) => images[0],
  roundState = new RoundRuntimeStateStore(),
  recentStrokeBatches = new RecentStrokeBatchStore(),
  resultSaveService = createMockResultSaveService(),
  timerScheduler = createMockTimerScheduler(),
  roundIdGenerator = () => "round-test",
  now = createClock(["2026-06-06T00:00:02.000Z"])
}: {
  io: Pick<Server, "to">;
  repository: InMemoryRoomRepository;
  imageRepository: InMemoryImageRepository;
  socket: Pick<Socket, "data" | "emit" | "join" | "leave">;
  selectImage?: (images: ImageMetadata[]) => ImageMetadata;
  roundState?: RoundRuntimeStateStore;
  recentStrokeBatches?: RecentStrokeBatchStore;
  resultSaveService?: Pick<ResultSaveService, "saveRoundResult">;
  timerScheduler?: ReturnType<typeof createMockTimerScheduler>;
  roundIdGenerator?: () => string;
  now?: () => Date;
}) {
  return {
    io,
    repository,
    imageRepository,
    socket,
    selectImage,
    recentStrokeBatches,
    resultSaveService,
    roundState,
    timerScheduler,
    roundIdGenerator,
    now
  };
}

function createTimerDependencies({
  io,
  repository,
  imageRepository,
  roundState = new RoundRuntimeStateStore(),
  recentStrokeBatches = new RecentStrokeBatchStore(),
  resultSaveService = createMockResultSaveService(),
  timerScheduler = createMockTimerScheduler(),
  selectImage = (images: ImageMetadata[]) => images[0],
  roundIdGenerator = () => "round-test",
  now = createClock(["2026-06-06T00:00:00.000Z"])
}: {
  io: Pick<Server, "to">;
  repository: InMemoryRoomRepository;
  imageRepository: InMemoryImageRepository;
  roundState?: RoundRuntimeStateStore;
  recentStrokeBatches?: RecentStrokeBatchStore;
  resultSaveService?: Pick<ResultSaveService, "saveRoundResult">;
  timerScheduler?: ReturnType<typeof createMockTimerScheduler>;
  selectImage?: (images: ImageMetadata[]) => ImageMetadata;
  roundIdGenerator?: () => string;
  now?: () => Date;
}) {
  return {
    io,
    repository,
    imageRepository,
    recentStrokeBatches,
    resultSaveService,
    roundState,
    timerScheduler,
    selectImage,
    roundIdGenerator,
    now
  };
}

function createMockTimerScheduler() {
  return {
    schedule: vi.fn(),
    clear: vi.fn()
  };
}

function createMockResultSaveService(
  payload:
    | {
        roomCode: string;
        roundId: string;
        roundIndex: number;
      }
    | null = null
): Pick<
  ResultSaveService,
  "saveRoundResult"
> {
  return {
    saveRoundResult: vi.fn().mockResolvedValue(
      payload
        ? {
            ...payload,
            result: {
              id: `result-${payload.roundId}`,
              roomCode: payload.roomCode,
              roundId: payload.roundId,
              roundIndex: payload.roundIndex,
              sourceImageId: "image-used",
              sourceImageFileId: "file-image-used",
              resultFileId: "result-file-1",
              thumbnailFileId: null,
              mimeType: "image/png",
              width: 1,
              height: 1,
              strokeCount: 0,
              createdAt: "2026-06-06T00:01:00.000Z"
            },
            createdAt: "2026-06-06T00:01:01.000Z"
          }
        : null
    )
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

function createImageMetadata(input: {
  id: string;
  firebaseUid?: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  used?: boolean;
}): ImageMetadata {
  return {
    id: input.id,
    roomCode: "ABC123",
    uploadedBy: {
      firebaseUid: input.firebaseUid ?? "host-uid",
      nickname: input.nickname ?? "Host",
      avatarUrl: input.avatarUrl ?? null
    },
    originalName: `${input.id}.png`,
    mimeType: "image/png",
    size: 9,
    storageType: "gridfs",
    fileId: `file-${input.id}`,
    width: null,
    height: null,
    used: input.used ?? false,
    createdAt: "2026-06-06T00:00:00.000Z"
  };
}

function createRoomDetail(input: { status: RoomDetail["status"] }): RoomDetail {
  return {
    roomCode: "ABC123",
    title: "Socket Room",
    status: input.status,
    hostUid: "host-uid",
    settings: roomSettings,
    participantCount: 2,
    maxPlayers: roomSettings.maxPlayers,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    participants: [
      {
        firebaseUid: "host-uid",
        nickname: "Host",
        avatarUrl: null,
        isHost: true,
        joinedAt: "2026-06-06T00:00:00.000Z"
      },
      {
        firebaseUid: "guest-uid",
        nickname: "Guest",
        avatarUrl: null,
        isHost: false,
        joinedAt: "2026-06-06T00:00:01.000Z"
      }
    ],
    currentRoundIndex: 0
  };
}

function createClock(values: string[]): () => Date {
  return () => new Date(values.shift() ?? "2026-06-06T00:00:59.000Z");
}

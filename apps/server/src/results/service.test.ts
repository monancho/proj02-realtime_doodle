import type { ImageMetadata } from "@doodle/shared";
import { describe, expect, it, vi } from "vitest";

import { InMemoryImageStorage } from "../images/in-memory-image-storage";
import { InMemoryResultRepository } from "./in-memory-result-repository";
import { InMemoryResultImageStorage } from "./in-memory-result-storage";
import { ResultSaveService } from "./service";

describe("ResultSaveService", () => {
  it("stores a result image and creates metadata idempotently per room round", async () => {
    const imageStorage = new InMemoryImageStorage();
    await imageStorage.storeFile({
      buffer: Buffer.from("source-image"),
      originalName: "source.png",
      mimeType: "image/png",
      metadata: {
        roomCode: "ABC123",
        uploadedByFirebaseUid: "host-uid",
        createdAt: "2026-06-06T00:00:00.000Z"
      }
    });
    const resultRepository = new InMemoryResultRepository({
      now: () => new Date("2026-06-06T00:01:00.000Z")
    });
    const resultStorage = new InMemoryResultImageStorage();
    const composer = {
      compose: vi.fn().mockResolvedValue({
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        mimeType: "image/png",
        width: 640,
        height: 480,
        strokeCount: 1
      })
    };
    const service = new ResultSaveService({
      composer,
      imageStorage,
      now: createClock([
        "2026-06-06T00:01:01.000Z",
        "2026-06-06T00:01:02.000Z",
        "2026-06-06T00:01:03.000Z"
      ]),
      resultRepository,
      resultStorage
    });

    const firstResult = await service.saveRoundResult({
      round: createRoundEndedPayload(),
      strokes: [
        {
          roomCode: "ABC123",
          roundId: "round-1",
          firebaseUid: "host-uid",
          createdAt: "2026-06-06T00:00:10.000Z",
          stroke: {
            strokeId: "stroke-1",
            tool: "pen",
            color: "#123ABC",
            width: 4,
            points: [{ x: 0.5, y: 0.5 }]
          }
        }
      ]
    });
    const secondResult = await service.saveRoundResult({
      round: createRoundEndedPayload(),
      strokes: []
    });

    expect(firstResult?.result).toMatchObject({
      roomCode: "ABC123",
      roundId: "round-1",
      roundIndex: 0,
      sourceImageId: "image-1",
      sourceImageFileId: "file-1",
      resultFileId: "result-file-1",
      mimeType: "image/png",
      width: 640,
      height: 480,
      strokeCount: 1
    });
    expect(secondResult?.result.id).toBe(firstResult?.result.id);
    expect(composer.compose).toHaveBeenCalledTimes(1);
    expect(resultStorage.getStoredFile("result-file-1")?.buffer).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    );
  });

  it("returns null after retrying failures without throwing", async () => {
    const service = new ResultSaveService({
      composer: {
        compose: vi.fn()
      },
      imageStorage: new InMemoryImageStorage(),
      now: () => new Date("2026-06-06T00:01:00.000Z"),
      resultRepository: new InMemoryResultRepository(),
      resultStorage: new InMemoryResultImageStorage()
    });

    await expect(
      service.saveRoundResult({ round: createRoundEndedPayload(), strokes: [] })
    ).resolves.toBeNull();
  });
});

function createRoundEndedPayload() {
  return {
    roomCode: "ABC123",
    roundId: "round-1",
    roundIndex: 0,
    image: createImageMetadata(),
    endedAt: "2026-06-06T00:01:00.000Z"
  };
}

function createImageMetadata(): ImageMetadata {
  return {
    id: "image-1",
    roomCode: "ABC123",
    uploadedBy: {
      firebaseUid: "host-uid",
      nickname: "Host",
      avatarUrl: null
    },
    originalName: "source.png",
    mimeType: "image/png",
    size: 12,
    storageType: "gridfs",
    fileId: "file-1",
    width: 640,
    height: 480,
    used: true,
    createdAt: "2026-06-06T00:00:00.000Z"
  };
}

function createClock(values: string[]): () => Date {
  return () => new Date(values.shift() ?? "2026-06-06T00:01:59.000Z");
}


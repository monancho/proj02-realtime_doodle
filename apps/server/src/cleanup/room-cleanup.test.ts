import { describe, expect, it, vi } from "vitest";

import {
  cleanupExpiredFinishedRooms,
  DEFAULT_ROOM_CLEANUP_RETENTION_MS,
  type ExpiredRoomCleanupStore
} from "./room-cleanup";

describe("cleanupExpiredFinishedRooms", () => {
  it("deletes expired room files and metadata in a best-effort pass", async () => {
    const store: ExpiredRoomCleanupStore = {
      findExpiredFinishedRoomCodes: vi.fn().mockResolvedValue(["ABC123"]),
      listOriginalImageFileIds: vi
        .fn()
        .mockResolvedValue(["original-1", "original-1", "original-2"]),
      listResultImageFileIds: vi
        .fn()
        .mockResolvedValue(["result-1", "thumb-1"]),
      deleteImageMetadataByRoomCodes: vi.fn().mockResolvedValue(2),
      deleteResultMetadataByRoomCodes: vi.fn().mockResolvedValue(1),
      deleteRoomsByCodes: vi.fn().mockResolvedValue(1)
    };
    const imageStorage = {
      deleteFile: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("missing file"))
    };
    const resultStorage = {
      deleteFile: vi.fn().mockResolvedValue(undefined)
    };

    const summary = await cleanupExpiredFinishedRooms({
      imageStorage,
      now: new Date("2026-06-08T00:00:00.000Z"),
      resultStorage,
      store
    });

    expect(store.findExpiredFinishedRoomCodes).toHaveBeenCalledWith({
      now: new Date("2026-06-08T00:00:00.000Z"),
      retentionMs: DEFAULT_ROOM_CLEANUP_RETENTION_MS
    });
    expect(imageStorage.deleteFile).toHaveBeenCalledTimes(2);
    expect(resultStorage.deleteFile).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({
      failedOriginalFiles: 1,
      failedResultFiles: 0,
      imageMetadataDeleted: 2,
      originalFilesDeleted: 1,
      resultFilesDeleted: 2,
      resultMetadataDeleted: 1,
      roomsDeleted: 1,
      roomsMatched: 1
    });
  });

  it("skips metadata deletion when there are no expired rooms", async () => {
    const store: ExpiredRoomCleanupStore = {
      findExpiredFinishedRoomCodes: vi.fn().mockResolvedValue([]),
      listOriginalImageFileIds: vi.fn(),
      listResultImageFileIds: vi.fn(),
      deleteImageMetadataByRoomCodes: vi.fn(),
      deleteResultMetadataByRoomCodes: vi.fn(),
      deleteRoomsByCodes: vi.fn()
    };

    const summary = await cleanupExpiredFinishedRooms({
      imageStorage: { deleteFile: vi.fn() },
      resultStorage: { deleteFile: vi.fn() },
      store
    });

    expect(store.listOriginalImageFileIds).not.toHaveBeenCalled();
    expect(summary.roomsMatched).toBe(0);
    expect(summary.roomsDeleted).toBe(0);
  });
});

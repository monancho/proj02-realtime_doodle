import type { ImageStorage } from "../images/storage";
import type { ResultImageStorage } from "../results/storage";

export const DEFAULT_ROOM_CLEANUP_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface ExpiredRoomCleanupStore {
  deleteImageMetadataByRoomCodes(roomCodes: string[]): Promise<number>;
  deleteResultMetadataByRoomCodes(roomCodes: string[]): Promise<number>;
  deleteRoomsByCodes(roomCodes: string[]): Promise<number>;
  findExpiredFinishedRoomCodes(input: {
    now: Date;
    retentionMs: number;
  }): Promise<string[]>;
  listOriginalImageFileIds(roomCodes: string[]): Promise<string[]>;
  listResultImageFileIds(roomCodes: string[]): Promise<string[]>;
}

export interface RoomCleanupSummary {
  failedOriginalFiles: number;
  failedResultFiles: number;
  imageMetadataDeleted: number;
  originalFilesDeleted: number;
  resultFilesDeleted: number;
  resultMetadataDeleted: number;
  roomsDeleted: number;
  roomsMatched: number;
}

export interface CleanupExpiredFinishedRoomsInput {
  imageStorage: Pick<ImageStorage, "deleteFile">;
  now?: Date;
  resultStorage: Pick<ResultImageStorage, "deleteFile">;
  retentionMs?: number;
  store: ExpiredRoomCleanupStore;
}

export async function cleanupExpiredFinishedRooms(
  input: CleanupExpiredFinishedRoomsInput
): Promise<RoomCleanupSummary> {
  const now = input.now ?? new Date();
  const retentionMs = input.retentionMs ?? DEFAULT_ROOM_CLEANUP_RETENTION_MS;
  const roomCodes = await input.store.findExpiredFinishedRoomCodes({
    now,
    retentionMs
  });

  if (roomCodes.length === 0) {
    return createEmptySummary();
  }

  const [originalFileIds, resultFileIds] = await Promise.all([
    input.store.listOriginalImageFileIds(roomCodes),
    input.store.listResultImageFileIds(roomCodes)
  ]);
  const originalFileSummary = await deleteFiles(
    originalFileIds,
    input.imageStorage
  );
  const resultFileSummary = await deleteFiles(resultFileIds, input.resultStorage);
  const imageMetadataDeleted =
    await input.store.deleteImageMetadataByRoomCodes(roomCodes);
  const resultMetadataDeleted =
    await input.store.deleteResultMetadataByRoomCodes(roomCodes);
  const roomsDeleted = await input.store.deleteRoomsByCodes(roomCodes);

  return {
    failedOriginalFiles: originalFileSummary.failed,
    failedResultFiles: resultFileSummary.failed,
    imageMetadataDeleted,
    originalFilesDeleted: originalFileSummary.deleted,
    resultFilesDeleted: resultFileSummary.deleted,
    resultMetadataDeleted,
    roomsDeleted,
    roomsMatched: roomCodes.length
  };
}

function createEmptySummary(): RoomCleanupSummary {
  return {
    failedOriginalFiles: 0,
    failedResultFiles: 0,
    imageMetadataDeleted: 0,
    originalFilesDeleted: 0,
    resultFilesDeleted: 0,
    resultMetadataDeleted: 0,
    roomsDeleted: 0,
    roomsMatched: 0
  };
}

async function deleteFiles(
  fileIds: string[],
  storage: { deleteFile(fileId: string): Promise<void> }
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  const uniqueFileIds = [...new Set(fileIds)];

  for (const fileId of uniqueFileIds) {
    try {
      await storage.deleteFile(fileId);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  return { deleted, failed };
}

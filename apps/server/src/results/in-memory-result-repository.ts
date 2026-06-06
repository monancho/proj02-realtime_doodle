import type { ResultMetadata } from "@doodle/shared";

import { normalizeRoomCode } from "../rooms/room-code";
import type {
  CreateResultMetadataInput,
  ResultRepository
} from "./repository";

export interface InMemoryResultRepositoryOptions {
  initialResults?: ResultMetadata[];
  now?: () => Date;
}

export class InMemoryResultRepository implements ResultRepository {
  private readonly resultsById = new Map<string, ResultMetadata>();
  private readonly resultIdsByRoomRound = new Map<string, string>();
  private readonly now: () => Date;
  private nextId = 1;

  public constructor(options: InMemoryResultRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());

    for (const result of options.initialResults ?? []) {
      this.resultsById.set(result.id, cloneResult(result));
      this.resultIdsByRoomRound.set(
        createRoomRoundKey(result.roomCode, result.roundId),
        result.id
      );
    }
  }

  public async createResult(
    input: CreateResultMetadataInput
  ): Promise<ResultMetadata> {
    const existingResult = await this.findResultByRoomRound(input);
    if (existingResult) {
      return existingResult;
    }

    const result: ResultMetadata = {
      id: `result-${this.nextId}`,
      roomCode: normalizeRoomCode(input.roomCode),
      roundId: input.roundId,
      roundIndex: input.roundIndex,
      sourceImageId: input.sourceImageId,
      sourceImageFileId: input.sourceImageFileId,
      resultFileId: input.resultFileId,
      thumbnailFileId: input.thumbnailFileId,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      strokeCount: input.strokeCount,
      createdAt: this.now().toISOString()
    };

    this.nextId += 1;
    this.resultsById.set(result.id, cloneResult(result));
    this.resultIdsByRoomRound.set(
      createRoomRoundKey(result.roomCode, result.roundId),
      result.id
    );

    return cloneResult(result);
  }

  public async findResultByRoomRound(input: {
    roomCode: string;
    roundId: string;
  }): Promise<ResultMetadata | null> {
    const resultId = this.resultIdsByRoomRound.get(
      createRoomRoundKey(input.roomCode, input.roundId)
    );
    const result = resultId ? this.resultsById.get(resultId) : null;

    return result ? cloneResult(result) : null;
  }
}

function createRoomRoundKey(roomCode: string, roundId: string): string {
  return `${normalizeRoomCode(roomCode)}:${roundId}`;
}

function cloneResult(result: ResultMetadata): ResultMetadata {
  return { ...result };
}


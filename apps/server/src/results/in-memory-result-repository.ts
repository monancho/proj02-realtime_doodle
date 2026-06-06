import type { ResultMetadata } from "@doodle/shared";

import { normalizeRoomCode } from "../rooms/room-code";
import type {
  CreateResultMetadataInput,
  ListResultsByRoomCodeInput,
  ListResultsByRoomCodeOutput,
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

  public async findResultById(
    resultId: string
  ): Promise<ResultMetadata | null> {
    const result = this.resultsById.get(resultId);

    return result ? cloneResult(result) : null;
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

  public async listResultsByRoomCode(
    input: ListResultsByRoomCodeInput
  ): Promise<ListResultsByRoomCodeOutput> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const sortedResults = [...this.resultsById.values()]
      .filter((result) => result.roomCode === roomCode)
      .sort(compareResultsDescending);
    const cursor = input.cursor;
    const resultsAfterCursor = cursor
      ? sortedResults.filter((result) => isAfterCursor(result, cursor))
      : sortedResults;
    const pageResults = resultsAfterCursor.slice(0, input.limit);
    const hasNextPage = resultsAfterCursor.length > input.limit;
    const lastResult = pageResults.at(-1);

    return {
      results: pageResults.map(cloneResult),
      nextCursor:
        hasNextPage && lastResult
          ? { createdAt: lastResult.createdAt, id: lastResult.id }
          : null
    };
  }
}

function createRoomRoundKey(roomCode: string, roundId: string): string {
  return `${normalizeRoomCode(roomCode)}:${roundId}`;
}

function cloneResult(result: ResultMetadata): ResultMetadata {
  return { ...result };
}

function compareResultsDescending(
  left: ResultMetadata,
  right: ResultMetadata
): number {
  const createdAtComparison = right.createdAt.localeCompare(left.createdAt);

  return createdAtComparison === 0
    ? right.id.localeCompare(left.id)
    : createdAtComparison;
}

function isAfterCursor(
  result: ResultMetadata,
  cursor: { createdAt: string; id: string }
): boolean {
  if (result.createdAt < cursor.createdAt) {
    return true;
  }

  return result.createdAt === cursor.createdAt && result.id < cursor.id;
}

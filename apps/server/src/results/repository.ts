import type { ResultMetadata } from "@doodle/shared";

export interface CreateResultMetadataInput {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  sourceImageId: string;
  sourceImageFileId: string;
  resultFileId: string;
  thumbnailFileId: string | null;
  mimeType: "image/png";
  width: number;
  height: number;
  strokeCount: number;
}

export interface ListResultsByRoomCodeInput {
  roomCode: string;
  limit: number;
  cursor: ResultPaginationCursor | null;
}

export interface ListResultsByRoomCodeOutput {
  results: ResultMetadata[];
  nextCursor: ResultPaginationCursor | null;
}

export interface ResultPaginationCursor {
  createdAt: string;
  id: string;
}

export interface ResultRepository {
  createResult(input: CreateResultMetadataInput): Promise<ResultMetadata>;
  findResultById(resultId: string): Promise<ResultMetadata | null>;
  findResultByRoomRound(input: {
    roomCode: string;
    roundId: string;
  }): Promise<ResultMetadata | null>;
  listResultsByRoomCode(
    input: ListResultsByRoomCodeInput
  ): Promise<ListResultsByRoomCodeOutput>;
}

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

export interface ResultRepository {
  createResult(input: CreateResultMetadataInput): Promise<ResultMetadata>;
  findResultByRoomRound(input: {
    roomCode: string;
    roundId: string;
  }): Promise<ResultMetadata | null>;
}


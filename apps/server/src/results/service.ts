import type { ResultMetadata } from "@doodle/shared";

import type { ImageStorage } from "../images/storage";
import { normalizeRoomCode } from "../rooms/room-code";
import type { DrawStrokeBroadcastPayload, RoundEndedPayload } from "../socket/rooms";
import type { ResultImageComposer } from "./composer";
import type { ResultRepository } from "./repository";
import type { ResultImageStorage } from "./storage";

const MAX_RESULT_SAVE_ATTEMPTS = 2;

export interface SaveRoundResultInput {
  round: RoundEndedPayload;
  strokes: DrawStrokeBroadcastPayload[];
}

export interface ResultSavedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  result: ResultMetadata;
  createdAt: string;
}

export interface ResultSaveDependencies {
  composer: ResultImageComposer;
  imageStorage: ImageStorage;
  now: () => Date;
  resultRepository: ResultRepository;
  resultStorage: ResultImageStorage;
}

export class ResultSaveService {
  public constructor(private readonly dependencies: ResultSaveDependencies) {}

  public async saveRoundResult(
    input: SaveRoundResultInput
  ): Promise<ResultSavedPayload | null> {
    for (let attempt = 0; attempt < MAX_RESULT_SAVE_ATTEMPTS; attempt += 1) {
      try {
        return await this.saveRoundResultOnce(input);
      } catch {
        if (attempt === MAX_RESULT_SAVE_ATTEMPTS - 1) {
          return null;
        }
      }
    }

    return null;
  }

  private async saveRoundResultOnce(
    input: SaveRoundResultInput
  ): Promise<ResultSavedPayload | null> {
    const roomCode = normalizeRoomCode(input.round.roomCode);
    const existingResult =
      await this.dependencies.resultRepository.findResultByRoomRound({
        roomCode,
        roundId: input.round.roundId
      });

    if (existingResult) {
      return {
        roomCode,
        roundId: input.round.roundId,
        roundIndex: input.round.roundIndex,
        result: existingResult,
        createdAt: this.dependencies.now().toISOString()
      };
    }

    const sourceFile = await this.dependencies.imageStorage.getFile(
      input.round.image.fileId
    );
    if (!sourceFile) {
      throw new Error("Source image file was not found.");
    }

    const sourceImageBuffer = await readStreamToBuffer(sourceFile.stream);
    const composedImage = await this.dependencies.composer.compose({
      sourceImage: input.round.image,
      sourceImageBuffer,
      strokes: input.strokes
    });
    const storedImage = await this.dependencies.resultStorage.storeResultImage({
      buffer: composedImage.buffer,
      metadata: {
        roomCode,
        roundId: input.round.roundId,
        sourceImageId: input.round.image.id,
        mimeType: composedImage.mimeType,
        createdAt: this.dependencies.now().toISOString()
      }
    });

    try {
      const result = await this.dependencies.resultRepository.createResult({
        roomCode,
        roundId: input.round.roundId,
        roundIndex: input.round.roundIndex,
        sourceImageId: input.round.image.id,
        sourceImageFileId: input.round.image.fileId,
        resultFileId: storedImage.fileId,
        thumbnailFileId: null,
        mimeType: composedImage.mimeType,
        width: composedImage.width,
        height: composedImage.height,
        strokeCount: composedImage.strokeCount
      });

      return {
        roomCode,
        roundId: input.round.roundId,
        roundIndex: input.round.roundIndex,
        result,
        createdAt: this.dependencies.now().toISOString()
      };
    } catch (error) {
      await this.dependencies.resultStorage.deleteFile(storedImage.fileId);
      throw error;
    }
  }
}

async function readStreamToBuffer(
  stream: NodeJS.ReadableStream
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}


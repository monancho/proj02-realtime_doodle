import type { ResultMetadata } from "@doodle/shared";
import type {
  Collection,
  Filter,
  IndexSpecification,
  OptionalUnlessRequiredId,
  WithId
} from "mongodb";

import { normalizeRoomCode } from "../rooms/room-code";
import type {
  CreateResultMetadataInput,
  ResultRepository
} from "./repository";

export interface ResultDocument {
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
  createdAt: Date;
}

export interface ResultCollection {
  insertOne(
    document: OptionalUnlessRequiredId<ResultDocument>
  ): Promise<{ insertedId?: unknown } | unknown>;
  findOne(filter: Filter<ResultDocument>): Promise<WithId<ResultDocument> | null>;
  createIndex(
    indexSpec: IndexSpecification,
    options?: { unique?: true }
  ): Promise<string>;
}

export class MongoResultRepository implements ResultRepository {
  public constructor(private readonly collection: ResultCollection) {}

  public async createResult(
    input: CreateResultMetadataInput
  ): Promise<ResultMetadata> {
    const existingResult = await this.findResultByRoomRound(input);
    if (existingResult) {
      return existingResult;
    }

    const document: ResultDocument = {
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
      createdAt: new Date()
    };

    await this.collection.insertOne(
      document as OptionalUnlessRequiredId<ResultDocument>
    );

    const insertedDocument = await this.collection.findOne({
      roomCode: document.roomCode,
      roundId: document.roundId
    });

    return mapResultDocumentToMetadata(insertedDocument ?? document);
  }

  public async findResultByRoomRound(input: {
    roomCode: string;
    roundId: string;
  }): Promise<ResultMetadata | null> {
    const document = await this.collection.findOne({
      roomCode: normalizeRoomCode(input.roomCode),
      roundId: input.roundId
    });

    return document ? mapResultDocumentToMetadata(document) : null;
  }
}

export function createMongoResultRepository(
  collection: Collection<ResultDocument>
): MongoResultRepository {
  return new MongoResultRepository(collection);
}

export async function ensureResultIndexes(
  collection: ResultCollection
): Promise<void> {
  await collection.createIndex({ roomCode: 1, roundId: 1 }, { unique: true });
  await collection.createIndex({ roomCode: 1, createdAt: -1 });
  await collection.createIndex({ sourceImageId: 1 });
}

export function mapResultDocumentToMetadata(
  document: ResultDocument | WithId<ResultDocument>
): ResultMetadata {
  const id =
    "_id" in document && document._id
      ? document._id.toString()
      : `${document.roomCode}:${document.roundId}`;

  return {
    id,
    roomCode: document.roomCode,
    roundId: document.roundId,
    roundIndex: document.roundIndex,
    sourceImageId: document.sourceImageId,
    sourceImageFileId: document.sourceImageFileId,
    resultFileId: document.resultFileId,
    thumbnailFileId: document.thumbnailFileId,
    mimeType: document.mimeType,
    width: document.width,
    height: document.height,
    strokeCount: document.strokeCount,
    createdAt: document.createdAt.toISOString()
  };
}


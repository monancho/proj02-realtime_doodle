import type { ResultMetadata } from "@doodle/shared";
import type {
  Collection,
  Filter,
  IndexSpecification,
  OptionalUnlessRequiredId,
  ObjectId,
  WithId
} from "mongodb";
import { ObjectId as MongoObjectId } from "mongodb";

import { normalizeRoomCode } from "../rooms/room-code";
import type {
  CreateResultMetadataInput,
  ListResultsByRoomCodeInput,
  ListResultsByRoomCodeOutput,
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
  find(filter: Filter<ResultDocument>): {
    sort(sort: Record<string, 1 | -1>): {
      limit(limit: number): {
        toArray(): Promise<Array<WithId<ResultDocument>>>;
      };
    };
  };
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

  public async findResultById(
    resultId: string
  ): Promise<ResultMetadata | null> {
    if (!MongoObjectId.isValid(resultId)) {
      return null;
    }

    const document = await this.collection.findOne({
      _id: new MongoObjectId(resultId) as unknown as ObjectId
    } as Filter<ResultDocument>);

    return document ? mapResultDocumentToMetadata(document) : null;
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

  public async listResultsByRoomCode(
    input: ListResultsByRoomCodeInput
  ): Promise<ListResultsByRoomCodeOutput> {
    const filter: Filter<ResultDocument> = {
      roomCode: normalizeRoomCode(input.roomCode),
      ...(input.cursor ? createCursorFilter(input.cursor) : {})
    } as Filter<ResultDocument>;
    const documents = await this.collection
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(input.limit + 1)
      .toArray();
    const pageDocuments = documents.slice(0, input.limit);
    const hasNextPage = documents.length > input.limit;
    const results = pageDocuments.map(mapResultDocumentToMetadata);
    const lastResult = results.at(-1);

    return {
      results,
      nextCursor:
        hasNextPage && lastResult
          ? { createdAt: lastResult.createdAt, id: lastResult.id }
          : null
    };
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

function createCursorFilter(cursor: {
  createdAt: string;
  id: string;
}): Filter<ResultDocument> {
  const createdAt = new Date(cursor.createdAt);

  if (!MongoObjectId.isValid(cursor.id)) {
    return { createdAt: { $lt: createdAt } } as Filter<ResultDocument>;
  }

  return {
    $or: [
      { createdAt: { $lt: createdAt } },
      {
        createdAt,
        _id: { $lt: new MongoObjectId(cursor.id) }
      }
    ]
  } as Filter<ResultDocument>;
}

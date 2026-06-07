import type { UserProfile } from "@doodle/shared";
import type { Collection, IndexSpecification, WithId } from "mongodb";

import type { UpsertUserInput, UserRepository } from "./repository";

export interface UserDocument {
  firebaseUid: string;
  email: string | null;
  nickname: string | null;
  nicknameNormalized: string | null;
  avatarUrl: string | null;
  profileSetupCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCollection {
  findOne(filter: Partial<Pick<UserDocument, "firebaseUid" | "nicknameNormalized">>): Promise<WithId<UserDocument> | null>;
  findOneAndUpdate(
    filter: Pick<UserDocument, "firebaseUid">,
    update: {
      $set: Omit<UserDocument, "firebaseUid" | "createdAt">;
      $setOnInsert: Pick<UserDocument, "firebaseUid" | "createdAt">;
    },
    options: {
      upsert: true;
      returnDocument: "after";
    }
  ): Promise<WithId<UserDocument> | null>;
  createIndex(
    indexSpec: IndexSpecification,
    options: { unique: true; partialFilterExpression?: Record<string, unknown> }
  ): Promise<string>;
}

export class MongoUserRepository implements UserRepository {
  public constructor(private readonly collection: UserCollection) {}

  public async findByFirebaseUid(firebaseUid: string): Promise<UserProfile | null> {
    const document = await this.collection.findOne({ firebaseUid });

    return document ? mapUserDocumentToProfile(document) : null;
  }

  public async findByNicknameNormalized(
    nicknameNormalized: string
  ): Promise<UserProfile | null> {
    const document = await this.collection.findOne({ nicknameNormalized });

    return document ? mapUserDocumentToProfile(document) : null;
  }

  public async upsertByFirebaseUid(
    input: UpsertUserInput
  ): Promise<UserProfile> {
    const now = new Date();
    const document = await this.collection.findOneAndUpdate(
      { firebaseUid: input.firebaseUid },
      {
        $set: {
          email: input.email,
          nickname: input.nickname,
          nicknameNormalized: input.nicknameNormalized,
          avatarUrl: input.avatarUrl,
          profileSetupCompletedAt: input.profileSetupCompletedAt
            ? new Date(input.profileSetupCompletedAt)
            : null,
          updatedAt: now
        },
        $setOnInsert: {
          firebaseUid: input.firebaseUid,
          createdAt: now
        }
      },
      {
        upsert: true,
        returnDocument: "after"
      }
    );

    if (!document) {
      throw new Error("User upsert did not return a document");
    }

    return mapUserDocumentToProfile(document);
  }
}

export function createMongoUserRepository(
  collection: Collection<UserDocument>
): MongoUserRepository {
  return new MongoUserRepository(collection);
}

export async function ensureUserIndexes(
  collection: UserCollection
): Promise<void> {
  await collection.createIndex({ firebaseUid: 1 }, { unique: true });
  await collection.createIndex(
    { nicknameNormalized: 1 },
    {
      unique: true,
      partialFilterExpression: { nicknameNormalized: { $type: "string" } }
    }
  );
}

function mapUserDocumentToProfile(document: UserDocument): UserProfile {
  return {
    firebaseUid: document.firebaseUid,
    email: document.email,
    nickname: document.nickname,
    nicknameNormalized: document.nicknameNormalized,
    avatarUrl: document.avatarUrl,
    profileSetupCompletedAt: document.profileSetupCompletedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  };
}

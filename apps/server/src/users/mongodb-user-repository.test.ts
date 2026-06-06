import type { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";

import {
  ensureUserIndexes,
  MongoUserRepository,
  type UserCollection,
  type UserDocument
} from "./mongodb-user-repository";

describe("MongoUserRepository", () => {
  it("upserts a user by firebaseUid", async () => {
    const document: UserDocument & { _id: ObjectId } = {
      _id: "object-id" as unknown as ObjectId,
      firebaseUid: "firebase-uid",
      email: "user@example.com",
      nickname: "Doodle User",
      avatarUrl: null,
      createdAt: new Date("2026-06-05T00:00:00.000Z"),
      updatedAt: new Date("2026-06-05T00:00:01.000Z")
    };
    const collection = {
      findOneAndUpdate: vi.fn().mockResolvedValue(document)
    } as unknown as UserCollection;

    const repository = new MongoUserRepository(collection);
    const user = await repository.upsertByFirebaseUid({
      firebaseUid: "firebase-uid",
      email: "user@example.com",
      nickname: "Doodle User",
      avatarUrl: null
    });

    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { firebaseUid: "firebase-uid" },
      expect.objectContaining({
        $set: expect.objectContaining({
          email: "user@example.com",
          nickname: "Doodle User",
          avatarUrl: null
        }),
        $setOnInsert: expect.objectContaining({
          firebaseUid: "firebase-uid"
        })
      }),
      { upsert: true, returnDocument: "after" }
    );
    expect(user).toEqual({
      firebaseUid: "firebase-uid",
      email: "user@example.com",
      nickname: "Doodle User",
      avatarUrl: null,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:01.000Z"
    });
  });

  it("creates a unique firebaseUid index", async () => {
    const collection = {
      createIndex: vi.fn().mockResolvedValue("firebaseUid_1")
    } as unknown as UserCollection;

    await ensureUserIndexes(collection);

    expect(collection.createIndex).toHaveBeenCalledWith(
      { firebaseUid: 1 },
      { unique: true }
    );
  });

  it("finds a user by firebaseUid", async () => {
    const document: UserDocument & { _id: ObjectId } = {
      _id: "object-id" as unknown as ObjectId,
      firebaseUid: "firebase-uid",
      email: "user@example.com",
      nickname: "Doodle User",
      avatarUrl: "https://example.test/avatar.png",
      createdAt: new Date("2026-06-05T00:00:00.000Z"),
      updatedAt: new Date("2026-06-05T00:00:01.000Z")
    };
    const collection = {
      findOne: vi.fn().mockResolvedValue(document)
    } as unknown as UserCollection;
    const repository = new MongoUserRepository(collection);

    const user = await repository.findByFirebaseUid("firebase-uid");

    expect(collection.findOne).toHaveBeenCalledWith({
      firebaseUid: "firebase-uid"
    });
    expect(user).toMatchObject({
      firebaseUid: "firebase-uid",
      nickname: "Doodle User",
      avatarUrl: "https://example.test/avatar.png"
    });
  });
});

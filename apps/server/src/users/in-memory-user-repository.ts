import type { UserProfile } from "@doodle/shared";

import type { UpsertUserInput, UserRepository } from "./repository";

export class InMemoryUserRepository implements UserRepository {
  private readonly usersByFirebaseUid = new Map<string, UserProfile>();

  public async upsertByFirebaseUid(
    input: UpsertUserInput
  ): Promise<UserProfile> {
    const now = new Date().toISOString();
    const existing = this.usersByFirebaseUid.get(input.firebaseUid);
    const user: UserProfile = {
      firebaseUid: input.firebaseUid,
      email: input.email,
      nickname: input.nickname,
      avatarUrl: input.avatarUrl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.usersByFirebaseUid.set(input.firebaseUid, user);

    return user;
  }

  public getByFirebaseUid(firebaseUid: string): UserProfile | undefined {
    return this.usersByFirebaseUid.get(firebaseUid);
  }
}

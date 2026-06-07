import type { UserProfile } from "@doodle/shared";

import type { UpsertUserInput, UserRepository } from "./repository";

export class InMemoryUserRepository implements UserRepository {
  private readonly usersByFirebaseUid = new Map<string, UserProfile>();

  public async findByFirebaseUid(firebaseUid: string): Promise<UserProfile | null> {
    const user = this.usersByFirebaseUid.get(firebaseUid);

    return user ? { ...user } : null;
  }

  public async findByNicknameNormalized(
    nicknameNormalized: string
  ): Promise<UserProfile | null> {
    const normalized = nicknameNormalized.toLowerCase();
    const user = [...this.usersByFirebaseUid.values()].find(
      (candidate) => candidate.nicknameNormalized === normalized
    );

    return user ? { ...user } : null;
  }

  public async upsertByFirebaseUid(
    input: UpsertUserInput
  ): Promise<UserProfile> {
    const now = new Date().toISOString();
    const existing = this.usersByFirebaseUid.get(input.firebaseUid);
    const user: UserProfile = {
      firebaseUid: input.firebaseUid,
      email: input.email,
      nickname: input.nickname,
      nicknameNormalized: input.nicknameNormalized,
      avatarUrl: input.avatarUrl,
      profileSetupCompletedAt: input.profileSetupCompletedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.usersByFirebaseUid.set(input.firebaseUid, user);

    return { ...user };
  }

  public getByFirebaseUid(firebaseUid: string): UserProfile | undefined {
    return this.usersByFirebaseUid.get(firebaseUid);
  }
}

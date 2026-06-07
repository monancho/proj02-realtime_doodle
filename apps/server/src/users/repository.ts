import type { UserProfile } from "@doodle/shared";

export interface UpsertUserInput {
  firebaseUid: string;
  email: string | null;
  nickname: string | null;
  nicknameNormalized: string | null;
  avatarUrl: string | null;
  profileSetupCompletedAt: string | null;
}

export interface UserRepository {
  findByFirebaseUid(firebaseUid: string): Promise<UserProfile | null>;
  findByNicknameNormalized(nicknameNormalized: string): Promise<UserProfile | null>;
  upsertByFirebaseUid(input: UpsertUserInput): Promise<UserProfile>;
}

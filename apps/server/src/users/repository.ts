import type { UserProfile } from "@doodle/shared";

export interface UpsertUserInput {
  firebaseUid: string;
  email: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface UserRepository {
  findByFirebaseUid(firebaseUid: string): Promise<UserProfile | null>;
  upsertByFirebaseUid(input: UpsertUserInput): Promise<UserProfile>;
}

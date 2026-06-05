import type { UserProfile } from "@doodle/shared";

export interface UpsertUserInput {
  firebaseUid: string;
  email: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface UserRepository {
  upsertByFirebaseUid(input: UpsertUserInput): Promise<UserProfile>;
}

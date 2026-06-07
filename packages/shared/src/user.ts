export interface UserProfile {
  firebaseUid: string;
  email: string | null;
  nickname: string | null;
  nicknameNormalized: string | null;
  avatarUrl: string | null;
  profileSetupCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertMeRequest {
  nickname?: string | null;
  avatarUrl?: string | null;
}

export interface UpsertMeResponse {
  user: UserProfile;
}

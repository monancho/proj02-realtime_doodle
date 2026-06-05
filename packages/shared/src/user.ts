export interface UserProfile {
  firebaseUid: string;
  email: string | null;
  nickname: string | null;
  avatarUrl: string | null;
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

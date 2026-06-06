import type {
  CreateRoomResponse,
  GetRoomResponse,
  ImageMetadata,
  JoinRoomResponse,
  ListRoomImagesResponse,
  ListRoomResultsResponse,
  RoomDetail,
  UploadImageResponse,
  UpsertMeResponse,
  UserProfile
} from "@doodle/shared";

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string;
}

export interface ApiClient {
  upsertMe(input: { nickname?: string | null; avatarUrl?: string | null }): Promise<UserProfile>;
  createRoom(input: { title: string }): Promise<RoomDetail>;
  getRoom(roomCode: string): Promise<RoomDetail>;
  joinRoom(roomCode: string): Promise<RoomDetail>;
  listImages(roomCode: string): Promise<ImageMetadata[]>;
  uploadImage(roomCode: string, file: File): Promise<ImageMetadata>;
  listResults(roomCode: string, cursor?: string | null): Promise<ListRoomResultsResponse>;
  downloadResult(resultId: string): Promise<{ blob: Blob; filename: string }>;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = trimTrailingSlash(options.baseUrl);

  async function requestJson<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
    const token = options.getToken().trim();

    if (!token) {
      throw new ApiClientError("로그인 토큰을 먼저 입력해 주세요.", "AUTH_TOKEN_MISSING", 401);
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    if (init.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    return response.json() as Promise<TResponse>;
  }

  return {
    async upsertMe(input) {
      const response = await requestJson<UpsertMeResponse>("/api/users/me", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return response.user;
    },
    async createRoom(input) {
      const response = await requestJson<CreateRoomResponse>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ title: input.title || null })
      });
      return response.room;
    },
    async getRoom(roomCode) {
      const response = await requestJson<GetRoomResponse>(`/api/rooms/${normalizeRoomCode(roomCode)}`);
      return response.room;
    },
    async joinRoom(roomCode) {
      const response = await requestJson<JoinRoomResponse>(`/api/rooms/${normalizeRoomCode(roomCode)}/join`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return response.room;
    },
    async listImages(roomCode) {
      const response = await requestJson<ListRoomImagesResponse>(`/api/rooms/${normalizeRoomCode(roomCode)}/images`);
      return response.images;
    },
    async uploadImage(roomCode, file) {
      const body = new FormData();
      body.set("image", file);

      const response = await requestJson<UploadImageResponse>(`/api/rooms/${normalizeRoomCode(roomCode)}/images`, {
        method: "POST",
        body
      });
      return response.image;
    },
    async listResults(roomCode, cursor) {
      const search = new URLSearchParams();
      search.set("limit", "20");

      if (cursor) {
        search.set("cursor", cursor);
      }

      return requestJson<ListRoomResultsResponse>(`/api/rooms/${normalizeRoomCode(roomCode)}/results?${search}`);
    },
    async downloadResult(resultId) {
      const token = options.getToken().trim();

      if (!token) {
        throw new ApiClientError("로그인 토큰을 먼저 입력해 주세요.", "AUTH_TOKEN_MISSING", 401);
      }

      const response = await fetch(`${baseUrl}/api/results/${encodeURIComponent(resultId)}/download`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw await createApiError(response);
      }

      return {
        blob: await response.blob(),
        filename: parseContentDispositionFilename(response.headers.get("Content-Disposition")) ?? `${resultId}.png`
      };
    }
  };
}

export function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

async function createApiError(response: Response): Promise<ApiClientError> {
  const fallback = `요청이 실패했습니다. (${response.status})`;

  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    return new ApiClientError(body.error?.message ?? fallback, body.error?.code ?? "API_ERROR", response.status);
  } catch {
    return new ApiClientError(fallback, "API_ERROR", response.status);
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseContentDispositionFilename(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = /filename="([^"]+)"/.exec(value);
  return match?.[1] ?? null;
}

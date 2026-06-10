export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ImageUploader {
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface ImageMetadata {
  id: string;
  roomCode: string;
  uploadedBy: ImageUploader;
  originalName: string;
  mimeType: ImageMimeType;
  size: number;
  storageType: "gridfs";
  fileId: string;
  width: number | null;
  height: number | null;
  used: boolean;
  active?: boolean;
  replacedAt?: string | null;
  createdAt: string;
}

export interface UploadImageResponse {
  image: ImageMetadata;
  warning?: {
    code: "IMAGE_MODERATION_REVIEW_REQUIRED";
    message: string;
  };
}

export interface ListRoomImagesResponse {
  images: ImageMetadata[];
}

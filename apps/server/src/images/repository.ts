import type { ImageMetadata, ImageMimeType, ImageUploader } from "@doodle/shared";

export interface CreateImageMetadataInput {
  roomCode: string;
  uploadedBy: ImageUploader;
  originalName: string;
  mimeType: ImageMimeType;
  size: number;
  fileId: string;
  width: number | null;
  height: number | null;
}

export interface ImageRepository {
  countImagesByUploader(input: {
    roomCode: string;
    firebaseUid: string;
  }): Promise<number>;
  createImageMetadata(input: CreateImageMetadataInput): Promise<ImageMetadata>;
  findImageById(imageId: string): Promise<ImageMetadata | null>;
  listImagesByRoomCode(roomCode: string): Promise<ImageMetadata[]>;
}

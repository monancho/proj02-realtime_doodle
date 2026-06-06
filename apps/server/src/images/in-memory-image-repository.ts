import type { ImageMetadata } from "@doodle/shared";

import type { CreateImageMetadataInput, ImageRepository } from "./repository";

export interface InMemoryImageRepositoryOptions {
  initialImages?: ImageMetadata[];
  now?: () => Date;
}

export class InMemoryImageRepository implements ImageRepository {
  private readonly imagesById = new Map<string, ImageMetadata>();
  private readonly now: () => Date;
  private nextId = 1;

  public constructor(options: InMemoryImageRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());

    for (const image of options.initialImages ?? []) {
      this.imagesById.set(image.id, cloneImage(image));
    }
  }

  public async countImagesByUploader(input: {
    roomCode: string;
    firebaseUid: string;
  }): Promise<number> {
    return [...this.imagesById.values()].filter(
      (image) =>
        image.roomCode === input.roomCode &&
        image.uploadedBy.firebaseUid === input.firebaseUid
    ).length;
  }

  public async createImageMetadata(
    input: CreateImageMetadataInput
  ): Promise<ImageMetadata> {
    const image: ImageMetadata = {
      id: `image-${this.nextId}`,
      roomCode: input.roomCode,
      uploadedBy: { ...input.uploadedBy },
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      storageType: "gridfs",
      fileId: input.fileId,
      width: input.width,
      height: input.height,
      used: false,
      createdAt: this.now().toISOString()
    };

    this.nextId += 1;
    this.imagesById.set(image.id, cloneImage(image));

    return cloneImage(image);
  }

  public async findImageById(imageId: string): Promise<ImageMetadata | null> {
    const image = this.imagesById.get(imageId);

    return image ? cloneImage(image) : null;
  }

  public async listImagesByRoomCode(roomCode: string): Promise<ImageMetadata[]> {
    return [...this.imagesById.values()]
      .filter((image) => image.roomCode === roomCode)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneImage);
  }
}

function cloneImage(image: ImageMetadata): ImageMetadata {
  return {
    ...image,
    uploadedBy: { ...image.uploadedBy }
  };
}

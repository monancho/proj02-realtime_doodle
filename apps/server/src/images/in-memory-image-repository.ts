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
        image.uploadedBy.firebaseUid === input.firebaseUid &&
        isActiveImage(image)
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
      active: true,
      replacedAt: null,
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

  public async deactivateActiveImagesByRoomCode(roomCode: string): Promise<void> {
    const normalizedRoomCode = roomCode;
    const replacedAt = this.now().toISOString();

    for (const [imageId, image] of this.imagesById.entries()) {
      if (image.roomCode === normalizedRoomCode && isActiveImage(image)) {
        this.imagesById.set(imageId, {
          ...image,
          uploadedBy: { ...image.uploadedBy },
          active: false,
          replacedAt
        });
      }
    }
  }

  public async deactivateActiveImagesByUploader(input: {
    roomCode: string;
    firebaseUid: string;
    exceptImageId?: string;
  }): Promise<void> {
    const replacedAt = this.now().toISOString();

    for (const [imageId, image] of this.imagesById.entries()) {
      if (
        image.roomCode === input.roomCode &&
        image.uploadedBy.firebaseUid === input.firebaseUid &&
        image.id !== input.exceptImageId &&
        isActiveImage(image)
      ) {
        this.imagesById.set(imageId, {
          ...image,
          uploadedBy: { ...image.uploadedBy },
          active: false,
          replacedAt
        });
      }
    }
  }

  public async listImagesByRoomCode(roomCode: string): Promise<ImageMetadata[]> {
    return [...this.imagesById.values()]
      .filter((image) => image.roomCode === roomCode && isActiveImage(image))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneImage);
  }

  public async listUnusedImagesByRoomCode(
    roomCode: string
  ): Promise<ImageMetadata[]> {
    return [...this.imagesById.values()]
      .filter(
        (image) => image.roomCode === roomCode && isActiveImage(image) && !image.used
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneImage);
  }

  public async markImageUsed(imageId: string): Promise<ImageMetadata | null> {
    const image = this.imagesById.get(imageId);

    if (!image || image.used || !isActiveImage(image)) {
      return null;
    }

    const nextImage: ImageMetadata = {
      ...image,
      uploadedBy: { ...image.uploadedBy },
      used: true
    };

    this.imagesById.set(imageId, nextImage);

    return cloneImage(nextImage);
  }
}

function cloneImage(image: ImageMetadata): ImageMetadata {
  return {
    ...image,
    uploadedBy: { ...image.uploadedBy }
  };
}

function isActiveImage(image: ImageMetadata): boolean {
  return image.active !== false;
}

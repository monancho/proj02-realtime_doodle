import type { ImageMetadata } from "@doodle/shared";
import { describe, expect, it } from "vitest";

import { DeterministicPngResultImageComposer } from "./composer";

describe("DeterministicPngResultImageComposer", () => {
  it("creates a valid PNG container", async () => {
    const composer = new DeterministicPngResultImageComposer();
    const result = await composer.compose({
      sourceImage: createImageMetadata(),
      sourceImageBuffer: Buffer.from("source-image"),
      strokes: []
    });

    expect(result.mimeType).toBe("image/png");
    expect(result.buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(result.buffer.includes(Buffer.from("IHDR"))).toBe(true);
    expect(result.buffer.includes(Buffer.from("IDAT"))).toBe(true);
    expect(result.buffer.includes(Buffer.from("IEND"))).toBe(true);
  });
});

function createImageMetadata(): ImageMetadata {
  return {
    id: "image-1",
    roomCode: "ABC123",
    uploadedBy: {
      firebaseUid: "host-uid",
      nickname: "Host",
      avatarUrl: null
    },
    originalName: "source.png",
    mimeType: "image/png",
    size: 12,
    storageType: "gridfs",
    fileId: "file-1",
    width: 16,
    height: 16,
    used: true,
    createdAt: "2026-06-06T00:00:00.000Z"
  };
}

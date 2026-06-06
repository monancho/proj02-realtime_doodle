import type { ImageMetadata } from "@doodle/shared";
import { describe, expect, it } from "vitest";

import { DeterministicPngResultImageComposer } from "./composer";

describe("DeterministicPngResultImageComposer", () => {
  it("creates a valid PNG container", async () => {
    const composer = new DeterministicPngResultImageComposer();
    const result = await composer.compose({
      sourceImage: createImageMetadata(),
      sourceImageBuffer: createOnePixelPng(),
      strokes: [
        {
          roomCode: "ABC123",
          roundId: "round-1",
          firebaseUid: "host-uid",
          createdAt: "2026-06-06T00:00:10.000Z",
          stroke: {
            strokeId: "stroke-1",
            tool: "pen",
            color: "#123ABC",
            width: 4,
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 }
            ]
          }
        }
      ]
    });

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(960);
    expect(result.height).toBe(720);
    expect(result.strokeCount).toBe(1);
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

function createOnePixelPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
}

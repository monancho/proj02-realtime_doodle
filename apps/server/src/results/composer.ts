import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

import type { ImageMetadata } from "@doodle/shared";

import type { DrawStrokeBroadcastPayload } from "../socket/rooms";

export interface ComposeResultImageInput {
  sourceImage: ImageMetadata;
  sourceImageBuffer: Buffer;
  strokes: DrawStrokeBroadcastPayload[];
}

export interface ComposedResultImage {
  buffer: Buffer;
  mimeType: "image/png";
  width: number;
  height: number;
  strokeCount: number;
}

export interface ResultImageComposer {
  compose(input: ComposeResultImageInput): Promise<ComposedResultImage>;
}

export class DeterministicPngResultImageComposer
  implements ResultImageComposer
{
  public async compose(
    input: ComposeResultImageInput
  ): Promise<ComposedResultImage> {
    if (input.sourceImageBuffer.byteLength === 0) {
      throw new Error("Source image buffer is empty.");
    }

    const width = input.sourceImage.width ?? 1;
    const height = input.sourceImage.height ?? 1;
    const digest = createHash("sha256")
      .update(input.sourceImageBuffer)
      .update(JSON.stringify(input.strokes))
      .digest("hex");

    const color = digestToColor(digest);

    return {
      buffer: createSolidPng(width, height, color),
      mimeType: "image/png",
      width,
      height,
      strokeCount: input.strokes.length
    };
  }
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

function createSolidPng(
  width: number,
  height: number,
  color: { red: number; green: number; blue: number; alpha: number }
): Buffer {
  const safeWidth = Math.max(1, Math.min(width, 4096));
  const safeHeight = Math.max(1, Math.min(height, 4096));
  const scanlineLength = 1 + safeWidth * 4;
  const raw = Buffer.alloc(scanlineLength * safeHeight);

  for (let y = 0; y < safeHeight; y += 1) {
    const rowOffset = y * scanlineLength;
    raw[rowOffset] = 0;

    for (let x = 0; x < safeWidth; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      raw[pixelOffset] = color.red;
      raw[pixelOffset + 1] = color.green;
      raw[pixelOffset + 2] = color.blue;
      raw[pixelOffset + 3] = color.alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(safeWidth, 0);
  ihdr.writeUInt32BE(safeHeight, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", deflateSync(raw)),
    createPngChunk("IEND", Buffer.alloc(0))
  ]);
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.byteLength, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function digestToColor(digest: string): {
  red: number;
  green: number;
  blue: number;
  alpha: number;
} {
  return {
    red: Number.parseInt(digest.slice(0, 2), 16),
    green: Number.parseInt(digest.slice(2, 4), 16),
    blue: Number.parseInt(digest.slice(4, 6), 16),
    alpha: 255
  };
}

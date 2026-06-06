import { createHash } from "node:crypto";

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

    return {
      buffer: Buffer.concat([
        PNG_SIGNATURE,
        Buffer.from(
          JSON.stringify({
            type: "realtime-doodle-result",
            sourceImageId: input.sourceImage.id,
            strokeCount: input.strokes.length,
            digest
          })
        )
      ]),
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


import type { ImageMetadata } from "@doodle/shared";
import sharp from "sharp";

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

    const source = sharp(input.sourceImageBuffer, { failOn: "none" });
    const metadata = await source.metadata();
    const width = metadata.width ?? input.sourceImage.width ?? 1;
    const height = metadata.height ?? input.sourceImage.height ?? 1;
    const overlay = createStrokeOverlaySvg(width, height, input.strokes);

    return {
      buffer: await sharp(input.sourceImageBuffer, { failOn: "none" })
        .rotate()
        .composite([{ input: Buffer.from(overlay), blend: "over" }])
        .png()
        .toBuffer(),
      mimeType: "image/png",
      width,
      height,
      strokeCount: input.strokes.length
    };
  }
}

function createStrokeOverlaySvg(
  width: number,
  height: number,
  strokes: DrawStrokeBroadcastPayload[]
): string {
  const paths = strokes
    .map(({ stroke }) => {
      if (stroke.points.length === 0) {
        return "";
      }

      const path = stroke.points
        .map((point, index) => {
          const command = index === 0 ? "M" : "L";
          return `${command}${formatSvgNumber(point.x * width)} ${formatSvgNumber(point.y * height)}`;
        })
        .join(" ");
      const strokeColor = stroke.tool === "eraser" ? "#fffefa" : stroke.color;

      return `<path d="${path}" fill="none" stroke="${escapeSvgAttribute(strokeColor)}" stroke-width="${formatSvgNumber(stroke.width)}" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths}</svg>`;
}

function formatSvgNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/\.?0+$/, "") : "0";
}

function escapeSvgAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

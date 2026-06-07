import type { ImageMetadata } from "@doodle/shared";
import sharp from "sharp";

import type { DrawStrokeBroadcastPayload } from "../socket/rooms";

const RESULT_FRAME_WIDTH = 960;
const RESULT_FRAME_HEIGHT = 720;

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

    const width = RESULT_FRAME_WIDTH;
    const height = RESULT_FRAME_HEIGHT;
    const overlay = createStrokeOverlaySvg(width, height, input.strokes);

    return {
      buffer: await sharp(input.sourceImageBuffer, { failOn: "none" })
        .rotate()
        .resize(width, height, { fit: "cover", position: "centre" })
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
  const erasers = strokes.map(({ stroke }) =>
    stroke.tool === "eraser"
      ? {
          path: createSvgPath(stroke.points, width, height),
          width: stroke.width
        }
      : null
  );
  const masks: string[] = [];
  const paths = strokes
    .map(({ stroke }, index) => {
      if (stroke.points.length === 0 || stroke.tool === "eraser") {
        return "";
      }

      const path = createSvgPath(stroke.points, width, height);
      const laterErasers = erasers.slice(index + 1).filter((eraser) => eraser !== null);
      const maskId = laterErasers.length > 0 ? `stroke-mask-${index}` : null;

      if (maskId) {
        masks.push(
          `<mask id="${maskId}" maskUnits="userSpaceOnUse"><rect width="${width}" height="${height}" fill="white" />${laterErasers
            .map((eraser) => `<path d="${eraser.path}" fill="none" stroke="black" stroke-width="${formatSvgNumber(eraser.width)}" stroke-linecap="round" stroke-linejoin="round" />`)
            .join("")}</mask>`
        );
      }

      return `<path d="${path}" fill="none" stroke="${escapeSvgAttribute(stroke.color)}" stroke-width="${formatSvgNumber(stroke.width)}" stroke-linecap="round" stroke-linejoin="round"${maskId ? ` mask="url(#${maskId})"` : ""} />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${masks.join("")}</defs>${paths}</svg>`;
}

function createSvgPath(
  points: DrawStrokeBroadcastPayload["stroke"]["points"],
  width: number,
  height: number
): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${formatSvgNumber(point.x * width)} ${formatSvgNumber(point.y * height)}`;
    })
    .join(" ");
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

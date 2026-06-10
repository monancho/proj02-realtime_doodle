import type { Request } from "express";

import { ImageDomainError } from "./errors";

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export interface MultipartFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export async function parseSingleImageMultipart(
  request: Request,
  maxFileSizeBytes: number
): Promise<MultipartFile> {
  const boundary = getMultipartBoundary(request.headers["content-type"]);

  if (!boundary) {
    throw new ImageDomainError(
      "IMAGE_PAYLOAD_INVALID",
      "multipart/form-data with an image file is required."
    );
  }

  const body = await readRequestBody(
    request,
    maxFileSizeBytes + MULTIPART_OVERHEAD_BYTES
  );
  const parts = splitMultipartBody(body, boundary);
  const imageParts = parts
    .map(parsePart)
    .filter((part): part is MultipartFile => part !== null);

  if (imageParts.length !== 1) {
    throw new ImageDomainError(
      "IMAGE_PAYLOAD_INVALID",
      "Exactly one image file is required."
    );
  }

  return imageParts[0];
}

function getMultipartBoundary(contentType: string | undefined): string | null {
  if (!contentType?.startsWith("multipart/form-data")) {
    return null;
  }

  const boundary = contentType
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("boundary="))
    ?.slice("boundary=".length);

  return boundary && boundary.length > 0 ? boundary : null;
}

async function readRequestBody(
  request: Request,
  maxBodySizeBytes: number
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    size += buffer.byteLength;
    if (size > maxBodySizeBytes) {
      throw new ImageDomainError(
        "IMAGE_FILE_TOO_LARGE",
        "Image file must be 5MB or smaller."
      );
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function splitMultipartBody(body: Buffer, boundary: string): Buffer[] {
  const boundaryMarker = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let cursor = body.indexOf(boundaryMarker);

  while (cursor !== -1) {
    const partStart = cursor + boundaryMarker.byteLength;
    const nextBoundary = body.indexOf(boundaryMarker, partStart);

    if (nextBoundary === -1) {
      break;
    }

    const part = body.subarray(partStart, nextBoundary);
    parts.push(trimPartBoundaryBytes(part));
    cursor = nextBoundary;
  }

  return parts;
}

function trimPartBoundaryBytes(part: Buffer): Buffer {
  let start = 0;
  let end = part.byteLength;

  if (part.subarray(0, 2).equals(Buffer.from("\r\n"))) {
    start = 2;
  }
  if (part.subarray(end - 2, end).equals(Buffer.from("\r\n"))) {
    end -= 2;
  }

  return part.subarray(start, end);
}

function parsePart(part: Buffer): MultipartFile | null {
  const separator = Buffer.from("\r\n\r\n");
  const separatorIndex = part.indexOf(separator);

  if (separatorIndex === -1) {
    return null;
  }

  const headerText = part.subarray(0, separatorIndex).toString("utf8");
  const content = part.subarray(separatorIndex + separator.byteLength);
  const disposition = getHeaderValue(headerText, "Content-Disposition");
  const contentType = getHeaderValue(headerText, "Content-Type");
  const name = getDispositionValue(disposition, "name");
  const filename = getDispositionValue(disposition, "filename");

  if (name !== "image" || !filename || !contentType) {
    return null;
  }

  return {
    buffer: content,
    filename,
    mimeType: contentType
  };
}

function getHeaderValue(headers: string, name: string): string | null {
  const prefix = `${name.toLowerCase()}:`;
  const line = headers
    .split("\r\n")
    .find((candidate) => candidate.toLowerCase().startsWith(prefix));

  return line ? line.slice(line.indexOf(":") + 1).trim() : null;
}

function getDispositionValue(
  disposition: string | null,
  name: string
): string | null {
  const value = disposition
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

  if (!value) {
    return null;
  }

  return value.replace(/^"|"$/g, "");
}

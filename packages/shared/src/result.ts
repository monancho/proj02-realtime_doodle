export interface ResultMetadata {
  id: string;
  roomCode: string;
  roundId: string;
  roundIndex: number;
  sourceImageId: string;
  sourceImageFileId: string;
  resultFileId: string;
  thumbnailFileId: string | null;
  mimeType: "image/png";
  width: number;
  height: number;
  strokeCount: number;
  createdAt: string;
}


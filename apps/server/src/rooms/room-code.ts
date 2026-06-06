import { randomInt } from "node:crypto";

const ROOM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ROOM_CODE_LENGTH = 6;

export type RoomCodeGenerator = () => string;

export const generateRoomCode: RoomCodeGenerator = () => {
  let code = "";

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }

  return code;
};

export function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

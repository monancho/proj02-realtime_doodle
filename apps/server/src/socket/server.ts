import type { Server as HttpServer } from "node:http";
import { Server as SocketIoServer } from "socket.io";

import { createSocketAuthMiddleware } from "../auth/socket";
import type { TokenVerifier } from "../auth/tokens";
import type { ServerEnv } from "../config/env";
import type { ImageRepository } from "../images/repository";
import type { ImageStorage } from "../images/storage";
import { DeterministicPngResultImageComposer } from "../results/composer";
import type { ResultRepository } from "../results/repository";
import { ResultSaveService } from "../results/service";
import type { ResultImageStorage } from "../results/storage";
import type { RoomRepository } from "../rooms/repository";
import { registerRoomMembershipHandlers } from "./rooms";

export interface SocketServerDependencies {
  env: ServerEnv;
  httpServer: HttpServer;
  imageRepository: ImageRepository;
  imageStorage: ImageStorage;
  resultRepository: ResultRepository;
  resultStorage: ResultImageStorage;
  roomRepository: RoomRepository;
  tokenVerifier: TokenVerifier;
}

export function createSocketServer({
  env,
  httpServer,
  imageRepository,
  imageStorage,
  resultRepository,
  resultStorage,
  roomRepository,
  tokenVerifier
}: SocketServerDependencies): SocketIoServer {
  const io = new SocketIoServer(httpServer, {
    cors: {
      origin: env.SOCKET_CORS_ORIGIN
    }
  });

  io.use(createSocketAuthMiddleware(tokenVerifier));
  registerRoomMembershipHandlers(
    io,
    roomRepository,
    imageRepository,
    imageStorage,
    new ResultSaveService({
      composer: new DeterministicPngResultImageComposer(),
      imageStorage,
      now: () => new Date(),
      resultRepository,
      resultStorage
    })
  );

  return io;
}

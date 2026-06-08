import type { Server as HttpServer } from "node:http";
import { Server as SocketIoServer } from "socket.io";

import { createSocketAuthMiddleware } from "../auth/socket";
import type { TokenVerifier } from "../auth/tokens";
import type { ServerEnv } from "../config/env";
import { createAllowedCorsOrigins } from "../http-cors";
import type { ImageRepository } from "../images/repository";
import type { ImageStorage } from "../images/storage";
import { DeterministicPngResultImageComposer } from "../results/composer";
import type { ResultRepository } from "../results/repository";
import { ResultSaveService } from "../results/service";
import type { ResultImageStorage } from "../results/storage";
import type { RoomRepository } from "../rooms/repository";
import type { UserRepository } from "../users/repository";
import { registerRoomMembershipHandlers } from "./rooms";

const LOCALHOST_DEV_SOCKET_ORIGIN_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1):517[0-9]$/;

export interface SocketServerDependencies {
  env: ServerEnv;
  httpServer: HttpServer;
  imageRepository: ImageRepository;
  imageStorage: ImageStorage;
  resultRepository: ResultRepository;
  resultStorage: ResultImageStorage;
  roomRepository: RoomRepository;
  tokenVerifier: TokenVerifier;
  userRepository: UserRepository;
}

export function createSocketServer({
  env,
  httpServer,
  imageRepository,
  imageStorage,
  resultRepository,
  resultStorage,
  roomRepository,
  tokenVerifier,
  userRepository
}: SocketServerDependencies): SocketIoServer {
  const io = new SocketIoServer(httpServer, {
    cors: {
      origin: createSocketCorsOrigins(env)
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
    }),
    userRepository
  );

  return io;
}

export function createSocketCorsOrigins(env: Pick<ServerEnv, "NODE_ENV" | "SOCKET_CORS_ORIGIN">): Array<string | RegExp> {
  const configuredOrigins = createAllowedCorsOrigins(env.SOCKET_CORS_ORIGIN);

  if (env.NODE_ENV === "production") {
    return configuredOrigins;
  }

  return [...configuredOrigins, LOCALHOST_DEV_SOCKET_ORIGIN_PATTERN];
}

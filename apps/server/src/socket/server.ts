import type { Server as HttpServer } from "node:http";
import { Server as SocketIoServer } from "socket.io";

import { createSocketAuthMiddleware } from "../auth/socket";
import type { TokenVerifier } from "../auth/tokens";
import type { ServerEnv } from "../config/env";
import type { RoomRepository } from "../rooms/repository";
import { registerRoomMembershipHandlers } from "./rooms";

export interface SocketServerDependencies {
  env: ServerEnv;
  httpServer: HttpServer;
  roomRepository: RoomRepository;
  tokenVerifier: TokenVerifier;
}

export function createSocketServer({
  env,
  httpServer,
  roomRepository,
  tokenVerifier
}: SocketServerDependencies): SocketIoServer {
  const io = new SocketIoServer(httpServer, {
    cors: {
      origin: env.SOCKET_CORS_ORIGIN
    }
  });

  io.use(createSocketAuthMiddleware(tokenVerifier));
  registerRoomMembershipHandlers(io, roomRepository);

  return io;
}

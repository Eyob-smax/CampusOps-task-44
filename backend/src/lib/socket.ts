import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from './logger';
import type { AuthenticatedUser } from '../types';

let io: SocketServer;

export function setupSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: false },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  // JWT authentication for all socket connections
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const user = jwt.verify(token, config.jwt.secret) as AuthenticatedUser;
      (socket as Socket & { user: AuthenticatedUser }).user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // Namespace: /classroom — real-time classroom status and anomaly events
  const classroomNs = io.of('/classroom');
  classroomNs.use(requireRole(['administrator', 'classroom_supervisor']));
  classroomNs.on('connection', (socket) => {
    const user = (socket as Socket & { user: AuthenticatedUser }).user;
    logger.info({ msg: 'Socket /classroom connected', userId: user.id });
    socket.on('disconnect', () =>
      logger.info({ msg: 'Socket /classroom disconnected', userId: user.id })
    );
  });

  // Namespace: /parking — parking space counts and alert events
  const parkingNs = io.of('/parking');
  parkingNs.use(requireRole(['administrator', 'operations_manager', 'classroom_supervisor']));
  parkingNs.on('connection', (socket) => {
    const user = (socket as Socket & { user: AuthenticatedUser }).user;
    logger.info({ msg: 'Socket /parking connected', userId: user.id });
  });

  // Namespace: /supervisor-queue — escalated alert queue
  const supervisorNs = io.of('/supervisor-queue');
  supervisorNs.use(requireRole(['administrator', 'classroom_supervisor']));
  supervisorNs.on('connection', (socket) => {
    logger.info({ msg: 'Socket /supervisor-queue connected' });
  });

  // Namespace: /jobs — background job progress
  const jobsNs = io.of('/jobs');
  // All authenticated users can subscribe to job events
  jobsNs.on('connection', () => {
    logger.info({ msg: 'Socket /jobs connected' });
  });

  // Namespace: /alerts — threshold breach banners (all authenticated users)
  const alertsNs = io.of('/alerts');
  alertsNs.on('connection', () => {
    logger.info({ msg: 'Socket /alerts connected' });
  });

  logger.info({ msg: 'Socket.IO namespaces registered', count: 5 });
  return io;
}

export function getSocketServer(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

export function emitToNamespace(
  namespace: '/classroom' | '/parking' | '/supervisor-queue' | '/jobs' | '/alerts',
  event: string,
  data: unknown
): void {
  if (!io) return;
  io.of(namespace).emit(event, data);
}

// Middleware factory to restrict namespace by role
function requireRole(roles: string[]) {
  return (socket: Socket, next: (err?: Error) => void) => {
    const user = (socket as Socket & { user: AuthenticatedUser }).user;
    if (!user || !roles.includes(user.role)) {
      return next(new Error('Forbidden'));
    }
    next();
  };
}

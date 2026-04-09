import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from './logger';
import type { AuthenticatedUser } from '../types';

let io: SocketServer;
type RealtimeNamespace = '/classroom' | '/parking' | '/supervisor-queue' | '/jobs' | '/alerts';

function campusRoom(campusId: string): string {
  return `campus:${campusId || 'main-campus'}`;
}

function joinCampusRoom(socket: Socket): void {
  const user = (socket as Socket & { user: AuthenticatedUser }).user;
  socket.join(campusRoom(user.campusId));
}

export function setupSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: false },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  const authenticateSocket = (socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, config.jwt.secret) as AuthenticatedUser & { campusId?: string };
      const user: AuthenticatedUser = {
        id: payload.id,
        username: payload.username,
        role: payload.role,
        campusId: payload.campusId ?? 'main-campus',
      };
      (socket as Socket & { user: AuthenticatedUser }).user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  };

  // Keep auth on the default namespace.
  io.use(authenticateSocket);

  // Namespace: /classroom — real-time classroom status and anomaly events
  const classroomNs = io.of('/classroom');
  classroomNs.use(authenticateSocket);
  classroomNs.use(requireRole(['administrator', 'classroom_supervisor']));
  classroomNs.on('connection', (socket) => {
    const user = (socket as Socket & { user: AuthenticatedUser }).user;
    joinCampusRoom(socket);
    logger.info({ msg: 'Socket /classroom connected', userId: user.id, campusId: user.campusId });
    socket.on('disconnect', () =>
      logger.info({ msg: 'Socket /classroom disconnected', userId: user.id })
    );
  });

  // Namespace: /parking — parking space counts and alert events
  const parkingNs = io.of('/parking');
  parkingNs.use(authenticateSocket);
  parkingNs.use(requireRole(['administrator', 'operations_manager', 'classroom_supervisor']));
  parkingNs.on('connection', (socket) => {
    const user = (socket as Socket & { user: AuthenticatedUser }).user;
    joinCampusRoom(socket);
    logger.info({ msg: 'Socket /parking connected', userId: user.id, campusId: user.campusId });
  });

  // Namespace: /supervisor-queue — escalated alert queue
  const supervisorNs = io.of('/supervisor-queue');
  supervisorNs.use(authenticateSocket);
  supervisorNs.use(requireRole(['administrator', 'classroom_supervisor']));
  supervisorNs.on('connection', (socket) => {
    const user = (socket as Socket & { user: AuthenticatedUser }).user;
    joinCampusRoom(socket);
    logger.info({ msg: 'Socket /supervisor-queue connected', userId: user.id, campusId: user.campusId });
  });

  // Namespace: /jobs — background job progress
  const jobsNs = io.of('/jobs');
  // All authenticated users can subscribe to job events
  jobsNs.use(authenticateSocket);
  jobsNs.on('connection', (socket) => {
    const user = (socket as Socket & { user: AuthenticatedUser }).user;
    joinCampusRoom(socket);
    logger.info({ msg: 'Socket /jobs connected', userId: user.id, campusId: user.campusId });
  });

  // Namespace: /alerts — threshold breach banners (all authenticated users)
  const alertsNs = io.of('/alerts');
  alertsNs.use(authenticateSocket);
  alertsNs.on('connection', (socket) => {
    const user = (socket as Socket & { user: AuthenticatedUser }).user;
    joinCampusRoom(socket);
    logger.info({ msg: 'Socket /alerts connected', userId: user.id, campusId: user.campusId });
  });

  logger.info({ msg: 'Socket.IO namespaces registered', count: 5 });
  return io;
}

export function getSocketServer(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

export function emitToNamespace(
  namespace: RealtimeNamespace,
  event: string,
  data: unknown
): void {
  if (!io) return;
  io.of(namespace).emit(event, data);
}

export function emitToCampusNamespace(
  namespace: RealtimeNamespace,
  campusId: string,
  event: string,
  data: unknown,
): void {
  if (!io) return;
  io.of(namespace).to(campusRoom(campusId)).emit(event, data);
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

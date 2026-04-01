import { ref, onMounted, onUnmounted } from "vue";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../stores/auth";
import { resolveBackendOrigin } from "../utils/network";
// Types are defined locally below; no import from classroom API needed

// ---- Event payload types ----
export interface ClassroomUpdateEvent {
  id: string;
  status?: string;
  recognitionConfidence?: number | null;
  lastHeartbeatAt?: string;
  wasOffline?: boolean;
}

export interface AnomalyCreatedEvent {
  anomalyId: string;
  classroomId: string;
  type: string;
  status: string;
}

export interface AnomalyUpdatedEvent {
  anomalyId: string;
  status: string;
  actorId?: string;
  assignedToId?: string;
}

/**
 * Composable for real-time classroom status updates via Socket.IO /classroom namespace.
 *
 * Usage:
 *   const { connected, classroomUpdates, anomalyCreated, anomalyUpdated, connect, disconnect } = useClassroomSocket();
 *
 * Callers subscribe to events by watching refs or passing callbacks.
 */
export function useClassroomSocket() {
  const auth = useAuthStore();
  const connected = ref(false);
  const lastError = ref<string | null>(null);

  const classroomUpdates = ref<ClassroomUpdateEvent[]>([]);
  const anomalyCreatedEvents = ref<AnomalyCreatedEvent[]>([]);
  const anomalyUpdatedEvents = ref<AnomalyUpdatedEvent[]>([]);

  let socket: Socket | null = null;
  const onClassroomUpdate = ref<((evt: ClassroomUpdateEvent) => void) | null>(
    null,
  );
  const onAnomalyCreated = ref<((evt: AnomalyCreatedEvent) => void) | null>(
    null,
  );
  const onAnomalyUpdated = ref<((evt: AnomalyUpdatedEvent) => void) | null>(
    null,
  );

  function connect() {
    if (socket?.connected) return;

    socket = io(`${resolveBackendOrigin()}/classroom`, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token: auth.accessToken },
    });

    socket.on("connect", () => {
      connected.value = true;
      lastError.value = null;
    });

    socket.on("disconnect", () => {
      connected.value = false;
    });

    socket.on("connect_error", (err: Error) => {
      lastError.value = err.message;
      connected.value = false;
    });

    socket.on("classroom:update", (evt: ClassroomUpdateEvent) => {
      classroomUpdates.value.push(evt);
      onClassroomUpdate.value?.(evt);
    });

    socket.on("classroom:recovered", (evt: { id: string; at: string }) => {
      // Treat as a status update with online status
      const update: ClassroomUpdateEvent = {
        id: evt.id,
        status: "online",
        wasOffline: true,
      };
      classroomUpdates.value.push(update);
      onClassroomUpdate.value?.(update);
    });

    socket.on("anomaly:created", (evt: AnomalyCreatedEvent) => {
      anomalyCreatedEvents.value.push(evt);
      onAnomalyCreated.value?.(evt);
    });

    socket.on("anomaly:updated", (evt: AnomalyUpdatedEvent) => {
      anomalyUpdatedEvents.value.push(evt);
      onAnomalyUpdated.value?.(evt);
    });
  }

  function disconnect() {
    socket?.disconnect();
    socket = null;
    connected.value = false;
  }

  onMounted(connect);
  onUnmounted(disconnect);

  return {
    connected,
    lastError,
    classroomUpdates,
    anomalyCreatedEvents,
    anomalyUpdatedEvents,
    onClassroomUpdate,
    onAnomalyCreated,
    onAnomalyUpdated,
    connect,
    disconnect,
  };
}

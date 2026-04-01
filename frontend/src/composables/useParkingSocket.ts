import { ref, onMounted, onUnmounted } from "vue";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../stores/auth";
import { resolveBackendOrigin } from "../utils/network";

export interface ParkingAlertEvent {
  alertId: string;
  lotId: string;
  type?: string;
  status?: string;
  slaDeadlineAt?: string;
  actorId?: string;
  auto?: boolean;
}

export interface LotStatsEvent {
  lotId: string;
  stats: unknown;
}

export function useParkingSocket() {
  const auth = useAuthStore();
  const connected = ref(false);
  const lastError = ref<string | null>(null);

  const onAlertCreated = ref<((evt: ParkingAlertEvent) => void) | null>(null);
  const onAlertUpdated = ref<((evt: ParkingAlertEvent) => void) | null>(null);
  const onLotStatsUpdate = ref<((evt: LotStatsEvent) => void) | null>(null);

  let socket: Socket | null = null;

  function connect() {
    if (socket?.connected) return;
    socket = io(`${resolveBackendOrigin()}/parking`, {
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
    socket.on("connect_error", (err) => {
      lastError.value = err.message;
      connected.value = false;
    });
    socket.on("alert:created", (evt: ParkingAlertEvent) =>
      onAlertCreated.value?.(evt),
    );
    socket.on("alert:updated", (evt: ParkingAlertEvent) =>
      onAlertUpdated.value?.(evt),
    );
    socket.on("lot:stats-update", (evt: LotStatsEvent) =>
      onLotStatsUpdate.value?.(evt),
    );
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
    onAlertCreated,
    onAlertUpdated,
    onLotStatsUpdate,
    connect,
    disconnect,
  };
}

import { io, Socket } from "socket.io-client";
import { resolveBackendOrigin } from "../utils/network";

let socket: Socket | null = null;

export function connectAlertSocket(
  token: string,
  onAlert: (message: string) => void,
): void {
  if (socket?.connected) return;

  socket = io(`${resolveBackendOrigin()}/alerts`, {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on("connect", () => console.debug("[alerts-socket] connected"));
  socket.on("disconnect", () => console.debug("[alerts-socket] disconnected"));

  socket.on(
    "threshold:breach",
    (data: { message: string; metric: string; value: number }) => {
      onAlert(`Alert: ${data.message} (${data.metric}=${data.value})`);
    },
  );

  socket.on("system:alert", (data: { message: string }) => {
    onAlert(data.message);
  });
}

export function disconnectAlertSocket(): void {
  socket?.disconnect();
  socket = null;
}

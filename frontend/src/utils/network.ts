const DEFAULT_BACKEND_PORT = 6006;

function parseBackendPort(): number {
  const raw = import.meta.env.VITE_BACKEND_PORT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BACKEND_PORT;
}

export function resolveBackendOrigin(locationLike?: {
  protocol?: string;
  hostname?: string;
}): string {
  const source =
    locationLike ??
    (typeof window !== "undefined" ? window.location : undefined);
  const protocol = source?.protocol === "https:" ? "https:" : "http:";
  const hostname = source?.hostname || "localhost";
  return `${protocol}//${hostname}:${parseBackendPort()}`;
}

export function resolveApiBaseUrl(locationLike?: {
  protocol?: string;
  hostname?: string;
}): string {
  return `${resolveBackendOrigin(locationLike)}/api`;
}

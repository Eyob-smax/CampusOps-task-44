/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_PORT?: string;
  readonly VITE_AUTH_REFRESH_MODE?: "localstorage" | "cookie";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

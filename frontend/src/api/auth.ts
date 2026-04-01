import { apiClient } from "./client";
import type { AuthUser } from "../types";

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const authApi = {
  login(username: string, password: string): Promise<LoginResponse> {
    return apiClient.post("/api/auth/login", {
      username,
      password,
    }) as unknown as Promise<LoginResponse>;
  },

  refresh(refreshToken: string): Promise<TokenPair> {
    return apiClient.post("/api/auth/refresh", {
      refreshToken,
    }) as unknown as Promise<TokenPair>;
  },

  logout(): Promise<void> {
    return apiClient.post("/api/auth/logout") as unknown as Promise<void>;
  },

  me(): Promise<AuthUser> {
    return apiClient.get("/api/auth/me") as unknown as Promise<AuthUser>;
  },

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return apiClient.post("/api/auth/change-password", {
      currentPassword,
      newPassword,
    }) as unknown as Promise<void>;
  },
};

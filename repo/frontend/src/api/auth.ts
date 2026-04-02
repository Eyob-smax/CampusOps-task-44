import { apiClient } from "./client";
import type { AuthUser } from "../types";
import type { AxiosResponse } from "axios";

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

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

export const authApi = {
  login(
    username: string,
    password: string,
  ): Promise<AxiosResponse<ApiEnvelope<LoginResponse>>> {
    return apiClient.post("/api/auth/login", {
      username,
      password,
    });
  },

  refresh(refreshToken: string): Promise<AxiosResponse<ApiEnvelope<TokenPair>>> {
    return apiClient.post("/api/auth/refresh", {
      refreshToken,
    });
  },

  logout(): Promise<AxiosResponse<ApiEnvelope<unknown>>> {
    return apiClient.post("/api/auth/logout");
  },

  me(): Promise<AxiosResponse<ApiEnvelope<AuthUser>>> {
    return apiClient.get("/api/auth/me");
  },

  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<AxiosResponse<ApiEnvelope<unknown>>> {
    return apiClient.post("/api/auth/change-password", {
      currentPassword,
      newPassword,
    });
  },
};

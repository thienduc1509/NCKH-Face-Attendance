import { apiClient } from "@/lib/api-client";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string | null;
}

export const AuthService = {
  login: async (username: string, password: string, remember = false): Promise<LoginResponse> => {
    const data = await apiClient.post<LoginResponse>("/auth/tokens", {
      username,
      password,
      remember_me: remember,
    }, {
      requiresAuth: false,
    });

    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", data.access_token);
      if (data.refresh_token) {
        localStorage.setItem("refresh_token", data.refresh_token);
      } else {
        localStorage.removeItem("refresh_token");
      }
    }

    return data;
  },

  sendOtp: async (mssv: string, email: string) => {
    return apiClient.post("/users/send-otp", { mssv, email }, { requiresAuth: false });
  },

  register: async (data: { mssv: string; email: string; password: string; otp_code: string }) => {
    return apiClient.post("/users/registrations", data, { requiresAuth: false });
  },

  logout: async () => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshToken = localStorage.getItem("refresh_token");
    try {
      if (refreshToken) {
        await apiClient.fetch("/sessions/current", {
          method: "DELETE",
          requiresAuth: false,
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      }
    } catch (error) {
      console.warn("Khong the weekday hoi refresh token khi dang xuat:", error);
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      window.location.replace("/");
    }
  },

  isAuthenticated: () => {
    if (typeof window !== "undefined") {
      return !!localStorage.getItem("access_token");
    }
    return false;
  }
};

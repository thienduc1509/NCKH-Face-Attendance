const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

export const apiClient = {
  async fetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { requiresAuth = true, headers, ...customConfig } = options;

    const config: RequestInit = {
      ...customConfig,
      headers: {
        ...headers,
      },
    };

    // Only set default Content-Type if it's not a FormData request
    // We determine this by checking if the Content-Type was explicitly removed or is not present
    // actually, a better way is to pass a flag or check if the body is FormData, but body is not available here easily.
    // However, if the caller didn't pass Content-Type, we default to json.
    if (!config.headers || !("Content-Type" in (config.headers as Record<string, string>))) {
      // It's possible Content-Type was explicitly set to undefined or deleted in post(),
      // but let's make it simpler: we will set application/json by default unless it's explicitly missing
      // Actually, if headers is passed from post() where Content-Type is deleted, it won't be in `headers`.
    }

    // A more robust way:
    const finalHeaders: Record<string, string> = { ...((headers as Record<string, string>) || {}) };
    if (!("Content-Type" in finalHeaders)) {
       finalHeaders["Content-Type"] = "application/json";
    } else if (finalHeaders["Content-Type"] === "multipart/form-data") {
        delete finalHeaders["Content-Type"]; // let browser set it with boundary
    }

    config.headers = finalHeaders;

    if (requiresAuth) {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        };
      }
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    } catch (e: any) {
      if (e.message === "Failed to fetch" || e.name === "TypeError") {
        throw new Error("Không thể kết nối tới máy chủ Backend (http://localhost:8000). Vui lòng kiểm tra máy chủ Backend (fastapi dev) đã được khởi động chưa!");
      }
      throw e;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Older backends return 403 for invalid JWTs; role-denial 403s must stay on the page.
      const invalidSession = response.status === 401 || (
        response.status === 403 && errorData.detail === "Could not validate credentials"
      );
      if (requiresAuth && invalidSession) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
          // Redirect to login page
          window.location.replace("/");
        }
      }

      let message = invalidSession ? "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại." : "";
      if (!invalidSession && typeof errorData.detail === "string") {
        message = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        message = errorData.detail.map((err: any) => err.msg || JSON.stringify(err)).join("; ");
      } else if (errorData.message && typeof errorData.message === "string") {
        message = errorData.message;
      }

      if (!message) {
        if (response.status === 400) {
          message = "Yêu cầu không hợp lệ. Vui lòng kiểm tra lại dữ liệu nhập vào.";
        } else if (response.status === 403) {
          message = "Bạn không có quyền thực hiện thao tác này.";
        } else if (response.status === 404) {
          message = "Không tìm thấy dữ liệu yêu cầu.";
        } else if (response.status === 500) {
          message = "Máy chủ xảy ra lỗi nội bộ (500). Vui lòng liên hệ quản trị viên.";
        } else {
          message = `Đã xảy ra lỗi từ hệ thống (Mã lỗi: ${response.status})`;
        }
      }

      throw new Error(message);
    }

    return response.json();
  },

  get<T>(endpoint: string, options?: RequestOptions) {
    return this.fetch<T>(endpoint, { ...options, method: "GET" });
  },

  post<T>(endpoint: string, body: any, options?: RequestOptions) {
    // If body is FormData, don't set Content-Type header so browser sets it with boundary
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

    const headers: Record<string, string> = { ...((options?.headers as Record<string, string>) || {}) };
    if (isFormData) {
       headers["Content-Type"] = "multipart/form-data";
    }

    return this.fetch<T>(endpoint, {
      ...options,
      method: "POST",
      headers,
      body: isFormData ? body : JSON.stringify(body),
    });
  },

  put<T>(endpoint: string, body: any, options?: RequestOptions) {
    return this.fetch<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  patch<T>(endpoint: string, body: any, options?: RequestOptions) {
    return this.fetch<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  delete<T>(endpoint: string, options?: RequestOptions) {
    return this.fetch<T>(endpoint, { ...options, method: "DELETE" });
  },
};

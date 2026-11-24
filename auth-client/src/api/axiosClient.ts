import axios, { type InternalAxiosRequestConfig } from "axios";

const API_URL = "http://localhost:3000";

const axiosClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // send cookies with requests
});

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/**
 * The refresh currently in flight, shared by every caller.
 *
 * Refresh tokens are single-use: the API rotates them and treats a second
 * use as possible theft. Several requests failing with 401 at once (or
 * React StrictMode running the session restore twice) must therefore share
 * one /auth/refresh call instead of each sending their own.
 */
let refreshInFlight: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = axiosClient
      .post<{ access_token: string }>("/auth/refresh")
      .then((res) => {
        setAccessToken(res.data.access_token);
        return res.data.access_token;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Called when the session can't be refreshed (expired, revoked, reused). */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

axiosClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const url = originalRequest?.url ?? "";

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !url.includes("/auth/login") &&
      !url.includes("/auth/refresh")
    ) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosClient(originalRequest);
      } catch (refreshError) {
        console.error("Refresh token failed", refreshError);
        setAccessToken(null);
        onSessionExpired?.();
      }
    }
    return Promise.reject(error);
  }
);

export default axiosClient;

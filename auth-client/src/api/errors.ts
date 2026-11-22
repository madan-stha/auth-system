import axios from "axios";

/** Shape of every error response from the API. */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/** A readable message from an API error, or `fallback` if there isn't one. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiError>(err) && err.response?.data?.message) {
    const { message } = err.response.data;
    return Array.isArray(message) ? message.join("\n") : message;
  }
  return fallback;
}

import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ErrorCode } from '@ecom/shared';

/** The API's error envelope, as the server sends it. */
export interface ApiErrorBody {
  success: false;
  message: string;
  code: ErrorCode;
  errors?: { field: string; message: string }[];
  requestId?: string;
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
  message?: string;
  meta?: unknown;
}

/**
 * A normalised error every component can rely on, instead of each call site
 * digging through `AxiosError.response.data` and guessing at the shape.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly fieldErrors: { field: string; message: string }[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Map server-side field errors onto react-hook-form's setError. */
  get fieldErrorMap(): Record<string, string> {
    return Object.fromEntries(this.fieldErrors.map((e) => [e.field, e.message]));
  }
}

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')[1];
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1',
  // Auth lives in httpOnly cookies, so every request must carry credentials.
  // The app never sees, stores, or forwards a token itself.
  withCredentials: true,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: attach the CSRF token on state-changing calls ───────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = readCookie(CSRF_COOKIE);
    if (token) config.headers.set(CSRF_HEADER, decodeURIComponent(token));
  }
  return config;
});

// ── Response: single-flight token refresh ────────────────────────────────────
/**
 * When an access token expires, every in-flight request fails with 401 at once.
 * Refreshing per request would fire N concurrent `/auth/refresh` calls — and
 * because refresh tokens rotate with reuse detection, the 2nd..Nth would look
 * like a stolen-token replay and log the user out.
 *
 * So: the first 401 starts a refresh, everyone else awaits that same promise,
 * and all original requests are replayed once it settles.
 */
let refreshPromise: Promise<void> | null = null;

/** Set by the auth store so a failed refresh can clear client state. */
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(handler: () => void): void {
  onAuthFailure = handler;
}

/** Endpoints where a 401 is the answer, not a session problem. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/register', '/auth/logout'];

async function refreshSession(): Promise<void> {
  refreshPromise ??= apiClient
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;

    // No response at all: offline, DNS failure, CORS rejection, timeout.
    if (!error.response) {
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        error.code === 'ECONNABORTED'
          ? 'The request timed out. Please check your connection and try again.'
          : 'Unable to reach the server. Please check your connection.',
      );
    }

    const { status, data } = error.response;
    const isRefreshable =
      status === 401 &&
      config &&
      !config._retried &&
      !NO_REFRESH_PATHS.some((path) => config.url?.includes(path));

    if (isRefreshable) {
      try {
        await refreshSession();
        config._retried = true;
        return apiClient.request(config);
      } catch {
        onAuthFailure?.();
        throw new ApiError(
          401,
          'UNAUTHENTICATED',
          'Your session has expired. Please sign in again.',
        );
      }
    }

    throw new ApiError(
      status,
      data?.code ?? 'INTERNAL_ERROR',
      data?.message ?? 'Something went wrong. Please try again.',
      data?.errors ?? [],
      data?.requestId,
    );
  },
);

/** Unwrap the `{ success, data }` envelope so callers work with plain data. */
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.get<ApiSuccessBody<T>>(url, config);
  return data.data;
}

/** Envelope-aware GET that also returns `meta` (pagination, facets). */
export async function apiGetWithMeta<T, M = unknown>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ data: T; meta: M }> {
  const { data } = await apiClient.get<ApiSuccessBody<T> & { meta: M }>(url, config);
  return { data: data.data, meta: data.meta };
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.post<ApiSuccessBody<T>>(url, body, config);
  return data.data;
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.patch<ApiSuccessBody<T>>(url, body, config);
  return data.data;
}

export async function apiPut<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.put<ApiSuccessBody<T>>(url, body, config);
  return data.data;
}

export async function apiDelete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.delete<ApiSuccessBody<T>>(url, config);
  return data?.data;
}

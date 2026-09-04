// Central API client. Every service (auth, events, tasks, ...) should
// go through this instead of calling fetch() directly.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getToken(): string | null {
  return localStorage.getItem('ep_authToken');
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (networkErr) {
    // Backend unreachable (server down, wrong URL, CORS, offline, etc.)
    throw new ApiError(
      'Could not reach the EventPilot server. Is the backend running?',
      0,
      'NETWORK_ERROR'
    );
  }

  let body: ApiEnvelope<T> | null = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response (e.g. server crashed with an HTML error page)
  }

  if (!response.ok || !body || body.success === false) {
    throw new ApiError(
      body?.message || `Request failed with status ${response.status}`,
      response.status,
      body?.code
    );
  }

  return body.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: 'POST', body: payload !== undefined ? JSON.stringify(payload) : undefined }),
  patch: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: 'PATCH', body: payload !== undefined ? JSON.stringify(payload) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

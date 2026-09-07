const BASE = "/api";

export class ApiError extends Error {
  status: number;
  code: string;
  detail?: unknown;

  constructor(status: number, code: string, detail?: unknown) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: payload,
      credentials: "include",
    });
  } catch (err) {
    throw new ApiError(0, "NETWORK_ERROR", err);
  }

  if (res.status === 401) {
    window.location.href = "/api/auth/login";
    // Prevent callers from proceeding while the redirect happens.
    throw new ApiError(401, "MISSING_TOKEN");
  }

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json().catch(() => ({})) : undefined;

  if (!res.ok) {
    const code = (data && typeof data === "object" && "error" in data ? (data as { error: string }).error : undefined) ?? `HTTP_${res.status}`;
    throw new ApiError(res.status, code, data);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
};

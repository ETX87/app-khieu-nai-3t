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

const HAD_SESSION_KEY = "khieunai_had_session";

function markHadSession() {
  try {
    sessionStorage.setItem(HAD_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}
function hadSession(): boolean {
  try {
    return sessionStorage.getItem(HAD_SESSION_KEY) === "1";
  } catch {
    return false;
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
    // Khong hard-redirect nua. Neu truoc do da co phien -> phat su kien de hien overlay
    // "dang nhap lai" ma khong xoa du lieu form dang nhap. Neu chua tung co phien ->
    // de AuthContext render man dang nhap co thuong hieu.
    if (hadSession()) {
      try {
        window.dispatchEvent(new CustomEvent("khieunai:session-expired"));
      } catch {
        /* ignore */
      }
      throw new ApiError(401, "SESSION_EXPIRED");
    }
    throw new ApiError(401, "MISSING_TOKEN");
  }

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json().catch(() => ({})) : undefined;

  if (res.ok) markHadSession();

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

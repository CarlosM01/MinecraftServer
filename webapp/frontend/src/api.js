const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

/**
 * Fetch wrapper for the panel API. Sends the session cookie, parses JSON,
 * throws Error(message) on failure and broadcasts "auth:expired" on 401.
 *
 * @param {string} method
 * @param {string} url      Path starting with /api
 * @param {object|FormData} [body]
 */
export async function request(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(BACKEND_URL + url, {
    method,
    credentials: "include",
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (res.status === 401 && !url.startsWith("/api/auth")) {
    window.dispatchEvent(new Event("auth:expired"));
  }
  if (!res.ok) {
    const err = new Error((isJson && data?.error) || `Error HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body ?? {}),
  put: (url, body) => request("PUT", url, body),
  del: (url, body) => request("DELETE", url, body),
};

export { BACKEND_URL };

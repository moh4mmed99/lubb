// Thin client for the hub's REST API (proxied to backend/ by next.config.mjs).
// Shapes mirror backend/app/models.py.

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("hub_unreachable", 0);
  }
  if (!res.ok) {
    let detail;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* not JSON: the proxy could not reach the hub */
    }
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg).join(", ");
    throw new ApiError(typeof detail === "string" ? detail : res.status >= 500 ? "hub_unreachable" : res.statusText, res.status);
  }
  return res.status === 204 ? null : res.json();
}

/** Error text for the UI: translates the "hub is down" case, shows the hub's own message otherwise. */
export function errorText(err, t) {
  return err?.message === "hub_unreachable" ? t("common.hubDown") : (err?.message ?? String(err));
}

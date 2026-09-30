import api, { BASE_URL } from "../api/api";

export const API_BASE = BASE_URL;

/**
 * Legacy signature kept so existing call sites don't change.
 * `token` is ignored — the axios instance attaches it and refreshes on 401.
 */
export async function apiRequest(endpoint, method = "GET", body = null, _token) {
  try {
    const res = await api.request({
      url: endpoint,
      method,
      data: body ?? undefined,
    });
    return res.data;
  } catch (err) {
    // Callers expect `err.message` to hold the server's error string,
    // the way the old fetch version threw it.
    const message =
      err.response?.data?.error || err.message || "Something went wrong";
    const wrapped = new Error(message);
    wrapped.status = err.response?.status;
    wrapped.response = err.response;
    throw wrapped;
  }
}
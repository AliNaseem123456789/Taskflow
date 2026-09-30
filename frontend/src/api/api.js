import axios from "axios";

// Set VITE_API_URL in frontend/.env (e.g. http://localhost:5000)
export const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,          // sends the refresh cookie
});

// Bare client for /refresh itself — must NOT go through the interceptor below,
// or a failing refresh retries itself forever.
const refreshClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

let accessToken = localStorage.getItem("accessToken") || null;

export const setAccessToken = (token) => {
  accessToken = token;
  if (token) localStorage.setItem("accessToken", token);
  else localStorage.removeItem("accessToken");
};

// ── Session helpers used across the app ──────────────────────────────────────

export const isLoggedIn = () => !!accessToken;

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
};

export const setStoredUser = (user) => {
  if (user) localStorage.setItem("user", JSON.stringify(user));
  else localStorage.removeItem("user");
};

// Timezone of this browser, e.g. "Asia/Karachi"
export const browserTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// Save the login response
export const saveLogin = (data) => {
  setAccessToken(data.accessToken);
  setStoredUser(data.user);
};

const clearLocalSession = () => {
  setAccessToken(null);
  setStoredUser(null);
  localStorage.removeItem("token"); // old key from before the session rework
};

// Ends the session on the server too, then clears the browser.
export const logout = async () => {
  window.dispatchEvent(new Event("app:logout")); // closes the live connection
  try {
    await api.post("/auth/logout");
  } catch {
    // still log out locally
  }
  clearLocalSession();
  window.location.href = "/login";
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// --- single-flight refresh -------------------------------------------------
let refreshPromise = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const callRefresh = async () => {
  try {
    return await refreshClient.post("/auth/refresh");
  } catch (err) {
    // 409 = another tab refreshed at the same moment; the browser now has the
    // new cookie, so one retry works.
    if (err.response?.status === 409) {
      await wait(500);
      return refreshClient.post("/auth/refresh");
    }
    throw err;
  }
};

const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = callRefresh()
      .then(({ data }) => {
        saveLogin(data);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;      // concurrent 401s all await this one call
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthCall = /\/auth\/(login|signup|refresh|logout)/.test(original?.url || "");

    if (error.response?.status !== 401 || original._retried || isAuthCall) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      clearLocalSession();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    }
  }
);

export default api;

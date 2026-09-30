import axios from "axios";

export const BASE_URL = "http://localhost:5000";
  // baseURL: "http://localhost:5000",
  // baseURL: "https://taskdoneflow.duckdns.org:3000",
  // // baseURL: "https://idonethis.onrender.com",
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

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// --- single-flight refresh -------------------------------------------------
let refreshPromise = null;

const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post("/api/auth/refresh")
      .then(({ data }) => {
        setAccessToken(data.accessToken);
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

    if (error.response?.status !== 401 || original._retried) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      setAccessToken(null);
      window.location.href = "/login";   // replace with your router's redirect
      return Promise.reject(refreshError);
    }
  }
);

export default api;
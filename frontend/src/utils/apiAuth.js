// Sends the login token with every request to the backend API, and signs the
// user out cleanly when the server says the login has expired.
//
// The backend accepts a request only with a valid token, so this runs once at
// startup (main.jsx) and covers both axios and fetch calls.
import axios from "axios";
import { BACKEND_URL } from "../config";

// Routes that are used before logging in, where a 401 means a wrong password
// or similar, not an expired session.
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/register-request",
  "/api/usersAccessControlPage/forgot-password",
  "/api/usersAccessControlPage/verify-email",
];

const SESSION_KEYS = ["token", "role", "username", "userId", "email"];

const toUrlString = (input) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url || "";
};

// The API path of a backend URL ("/api/..."), or null for other URLs
// (Cloudinary, images, the app's own pages).
const getApiPath = (input) => {
  const url = toUrlString(input);
  if (!url) return null;
  let rest = null;
  if (BACKEND_URL && url.startsWith(BACKEND_URL)) {
    rest = url.slice(BACKEND_URL.length);
  } else if (url.startsWith("/api/")) {
    rest = url;
  }
  if (!rest || !rest.startsWith("/api/")) return null;
  return rest.split(/[?#]/, 1)[0];
};

const isPublicPath = (apiPath) =>
  PUBLIC_API_PATHS.some((path) => apiPath === path);

const getToken = () => {
  try {
    return localStorage.getItem("token") || "";
  } catch {
    return "";
  }
};

let redirecting = false;

const handleExpiredSession = () => {
  if (redirecting) return;
  redirecting = true;
  try {
    SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked: the login page still opens.
  }
  window.location.assign("/auth?expired=1");
};

const shouldSignOut = (apiPath, status, sentToken) =>
  status === 401 && Boolean(sentToken) && apiPath && !isPublicPath(apiPath);

let installed = false;

export const installApiAuth = () => {
  if (installed) return;
  installed = true;

  axios.interceptors.request.use((config) => {
    const apiPath = getApiPath(config.url);
    const token = getToken();
    if (apiPath && token) {
      config.headers = config.headers || {};
      if (typeof config.headers.set === "function") {
        if (!config.headers.has?.("Authorization")) {
          config.headers.set("Authorization", `Bearer ${token}`);
        }
      } else if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  });

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const config = error?.config || {};
      const apiPath = getApiPath(config.url);
      const sent =
        config.headers?.Authorization ||
        (typeof config.headers?.get === "function"
          ? config.headers.get("Authorization")
          : "");
      if (shouldSignOut(apiPath, error?.response?.status, sent)) {
        handleExpiredSession();
      }
      return Promise.reject(error);
    },
  );

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const apiPath = getApiPath(input);
    const token = getToken();
    let nextInit = init;
    let sentToken = "";

    if (apiPath && token) {
      const headers = new Headers(
        init.headers || (input instanceof Request ? input.headers : undefined),
      );
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      sentToken = headers.get("Authorization");
      nextInit = { ...init, headers };
    }

    const response = await originalFetch(input, nextInit);
    if (shouldSignOut(apiPath, response.status, sentToken)) {
      handleExpiredSession();
    }
    return response;
  };
};

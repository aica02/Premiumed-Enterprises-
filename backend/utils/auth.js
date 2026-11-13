// Login tokens and API access rules.
//
// Every /api request needs a valid login token, except the few public routes
// listed below (login, sign-up, password help, the accountant's email links).
// Who the caller is comes ONLY from the verified token: headers such as
// X-Username or X-Role and names in the request body are never trusted.
import jwt from "jsonwebtoken";

export const ROLES = {
  ADMIN: "Admin",
  STAFF: "Staff",
  DRIVER: "Driver",
  CLIENT: "User",
};

const ALL = [ROLES.ADMIN, ROLES.STAFF, ROLES.DRIVER, ROLES.CLIENT];
const EMPLOYEES = [ROLES.ADMIN, ROLES.STAFF, ROLES.DRIVER];
const ADMIN = [ROLES.ADMIN];
const CLIENT = [ROLES.CLIENT];

const MIN_SECRET_LENGTH = 32;

// Read lazily: dotenv runs after the ES module imports are evaluated.
const getSecret = () => process.env.JWT_SECRET;

// Called once at startup. A missing or short secret would let anyone forge
// an Admin token, so the server refuses to start instead.
export const assertJwtSecret = () => {
  const secret = getSecret();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set to a random value of at least ${MIN_SECRET_LENGTH} characters.`,
    );
  }
};

export const signLoginToken = (user, expiresIn = "24h") =>
  jwt.sign(
    {
      userId: String(user._id),
      username: user.username,
      role: user.role,
    },
    getSecret(),
    { expiresIn },
  );

// Sets req.user from a valid Bearer token, and req.actor (used by activity
// logs) from req.user only.
export const authenticate = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  req.user = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, getSecret());
      if (decoded?.userId && decoded?.username && decoded?.role) {
        req.user = {
          userId: String(decoded.userId),
          username: decoded.username,
          role: decoded.role,
        };
      }
    } catch {
      req.user = null;
    }
  }

  req.actor = {
    userId: req.user?.userId || null,
    username: req.user?.username || null,
    role: req.user?.role || null,
  };
  next();
};

export const isClient = (req) => req.user?.role === ROLES.CLIENT;
export const isEmployee = (req) => EMPLOYEES.includes(req.user?.role);

// True when `username` names the logged-in account. Exact match: the routes
// look users up by exact username, so "Maria" must not unlock "maria".
export const isSelf = (req, username) =>
  Boolean(req.user?.username) &&
  typeof username === "string" &&
  username.trim() === String(req.user.username).trim();

// ---------------------------------------------------------------------------
// Access table. First matching rule wins. Paths are relative to /api.
//   public: no login needed
//   roles:  who may call it
//   self:   (req) => the username the request acts on; a client may only act
//           on their own account. Employees in `roles` skip this check
//           unless `selfForAll` is set.
// Anything not listed is for employees only (Admin, Staff, Driver).
// ---------------------------------------------------------------------------
const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
// A missing name counts as a mismatch, so a client cannot skip the check.
const paramName = (index) => (req, parts) => safeDecode(parts[index] || "") || "\u0000";
const bodyUsername = (req) => req.body?.username;

const RULES = [
  // ---- Public ----
  { method: "POST", path: /^\/auth\/login$/, public: true },
  { method: "POST", path: /^\/auth\/register-request$/, public: true },
  { method: "POST", path: /^\/clients\/register-request$/, public: true },
  { method: "GET", path: /^\/clients\/(accept|reject)-deposit$/, public: true },
  { method: "POST", path: /^\/login$/, public: true },
  { method: "POST", path: /^\/usersAccessControlPage\/(forgot-password|verify-email)$/, public: true },

  // ---- Any logged-in account, own account only ----
  { method: "POST", path: /^\/usersAccessControlPage\/change-password$/, roles: ALL, self: bodyUsername, selfForAll: true },
  { method: "GET", path: /^\/profile\/get\/([^/]+)$/, roles: ALL, self: paramName(1), selfForAll: true },
  { method: "PUT", path: /^\/profile\/update\/([^/]+)$/, roles: ALL, self: paramName(1), selfForAll: true },
  { method: "POST", path: /^\/login\/change-password$/, roles: ALL, selfId: (req) => req.body?.userId },
  { method: "GET", path: /^\/login\/profile\/([^/]+)$/, roles: ALL, selfId: (req, parts) => parts[1] },
  { method: "PUT", path: /^\/login\/profile\/([^/]+)$/, roles: ALL, selfId: (req, parts) => parts[1] },
  { method: "POST", path: /^\/activitylogs\/report-printed$/, roles: ALL },

  // ---- Client portal ----
  { method: "GET", path: /^\/auth\/profile\/([^/]+)$/, roles: [ROLES.ADMIN, ROLES.CLIENT], self: paramName(1) },
  { method: "GET", path: /^\/cart\/([^/]+)$/, roles: CLIENT, self: paramName(1) },
  { method: "DELETE", path: /^\/cart\/clear\/([^/]+)$/, roles: CLIENT, self: paramName(1) },
  { method: "*", path: /^\/cart\/(add|update|remove|sync)$/, roles: CLIENT, self: bodyUsername },
  { method: "GET", path: /^\/products$/, roles: ALL },
  { method: "POST", path: /^\/orders$/, roles: CLIENT },
  { method: "POST", path: /^\/orders\/checkout-with-split$/, roles: CLIENT },
  { method: "DELETE", path: /^\/orders\/remove-items$/, roles: CLIENT, self: bodyUsername },
  { method: "GET", path: /^\/orders\/(user|overdue)\/([^/]+)$/, roles: [ROLES.ADMIN, ROLES.CLIENT], self: paramName(2) },
  { method: "GET", path: /^\/orders\/notifications\/([^/]+)$/, roles: CLIENT, self: paramName(1) },
  { method: "PATCH", path: /^\/orders\/notifications\/read\/([^/]+)(\/[^/]+)?$/, roles: CLIENT, self: paramName(1) },
  // Ownership of the order is checked in the route.
  { method: "POST", path: /^\/orders\/upload-slip$/, roles: [ROLES.ADMIN, ROLES.CLIENT] },
  { method: "PATCH", path: /^\/orders\/[^/]+\/cancel$/, roles: [ROLES.ADMIN, ROLES.CLIENT] },
  // Which status each role may set is checked in the route.
  { method: "PATCH", path: /^\/orders\/[^/]+\/status$/, roles: ALL },
  // The client answers a brand change on their own order (checked in the route).
  { method: "PATCH", path: /^\/orders\/[^/]+\/brand-response$/, roles: CLIENT },

  // ---- Admin only ----
  { method: "GET", path: /^\/orders\/reset-counters$/, roles: [] },
  { method: "PATCH", path: /^\/orders\/[^/]+\/(partial|edit-date|propose-brand)$/, roles: ADMIN },
  { method: "GET", path: /^\/orders\/[^/]+\/brand-alternatives\/[^/]+$/, roles: ADMIN },
  { method: "*", path: /^\/usersAccessControlPage(\/.*)?$/, roles: ADMIN },
  { method: "*", path: /^\/auth\/(requests|approve-client)$/, roles: ADMIN },
  { method: "*", path: /^\/clients\/(requests|check-username|approve-client)$/, roles: ADMIN },
  { method: "GET", path: /^\/settings$/, roles: EMPLOYEES },
  { method: "*", path: /^\/settings(\/.*)?$/, roles: ADMIN },
  { method: "PUT", path: /^\/products\/(updatePrices|[^/]+\/reserve)$/, roles: ADMIN },
  { method: "GET", path: /^\/products\/reservable-clients$/, roles: ADMIN },
  { method: "GET", path: /^\/activitylogs$/, roles: ADMIN },
  { method: "*", path: /^\/notifications(\/.*)?$/, roles: ADMIN },
  { method: "GET", path: /^\/suppliers(\/all)?$/, roles: EMPLOYEES },
  { method: "*", path: /^\/suppliers(\/.*)?$/, roles: ADMIN },
];

const DEFAULT_RULE = { roles: EMPLOYEES };

// Express matches routes regardless of letter case (/api/USERSACCESSCONTROLPAGE
// reaches the same router), so the rules must too, or a changed case would
// fall through to the employee default and skip an Admin-only rule.
const CASE_INSENSITIVE_RULES = RULES.map((rule) => ({
  ...rule,
  path: new RegExp(rule.path.source, rule.path.flags.includes("i") ? rule.path.flags : `${rule.path.flags}i`),
}));

const findRule = (method, path) => {
  // Express answers HEAD with the GET handler, so HEAD follows GET rules.
  const effectiveMethod = method === "HEAD" ? "GET" : method;
  for (const rule of CASE_INSENSITIVE_RULES) {
    if (rule.method !== "*" && rule.method !== effectiveMethod) continue;
    const parts = path.match(rule.path);
    if (parts) return { rule, parts };
  }
  return { rule: DEFAULT_RULE, parts: [] };
};

// Mounted on /api. Runs after the body parsers, so JSON bodies are readable;
// multipart routes check ownership in the route itself.
export const requireApiAccess = (req, res, next) => {
  if (req.method === "OPTIONS") return next();

  const path = (req.path || "/").replace(/\/+$/, "") || "/";
  const { rule, parts } = findRule(req.method, path);

  if (rule.public) return next();

  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: "LOGIN_REQUIRED",
      message: "Your session has expired. Please log in again.",
      error: "Your session has expired. Please log in again.",
    });
  }

  if (!rule.roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Your account does not have access to this action.",
      error: "Your account does not have access to this action.",
    });
  }

  const checkSelf = rule.self && (rule.selfForAll || isClient(req));
  if (checkSelf) {
    const target = rule.self(req, parts);
    if (target && !isSelf(req, target)) {
      return res.status(403).json({
        success: false,
        code: "NOT_YOUR_ACCOUNT",
        message: "You can only access your own account.",
        error: "You can only access your own account.",
      });
    }
  }

  if (rule.selfId) {
    const targetId = rule.selfId(req, parts);
    if (targetId && String(targetId) !== String(req.user.userId) && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        code: "NOT_YOUR_ACCOUNT",
        message: "You can only access your own account.",
        error: "You can only access your own account.",
      });
    }
  }

  next();
};

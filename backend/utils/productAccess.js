// Rules for supplies that are reserved for specific clients (dialysis centers).
// Products saved before reservedFor existed have no such field, so a missing,
// null or empty list all mean "visible to every client".

export const normalizeUsername = (username) =>
  String(username || "").trim().toLowerCase();

export const getReservedFor = (product) =>
  Array.isArray(product?.reservedFor)
    ? product.reservedFor.map(normalizeUsername).filter(Boolean)
    : [];

export const isReserved = (product) => getReservedFor(product).length > 0;

export const canClientSee = (product, username) => {
  const reservedFor = getReservedFor(product);
  if (reservedFor.length === 0) return true;
  const user = normalizeUsername(username);
  return Boolean(user) && reservedFor.includes(user);
};

export const RESERVED_SUPPLY_MESSAGE =
  "This supply is reserved for another client and cannot be ordered from your account.";

// Who is asking. A verified login token (req.user, set in server.js) wins over
// any username the browser sends in headers, query or body.
export const resolveClientUsername = (req, ...fallbacks) =>
  normalizeUsername(
    req.user?.username ||
      fallbacks.find((value) => String(value || "").trim()) ||
      "",
  );

// Admin/Staff/Driver screens see every supply. A verified token's role wins
// over the X-Role header.
export const isStaffRequest = (req) => {
  const role = String(req.user?.role || req.headers["x-role"] || "").trim().toLowerCase();
  return Boolean(role) && role !== "user";
};

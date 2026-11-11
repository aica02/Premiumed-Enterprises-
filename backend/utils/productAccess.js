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

// Who is asking: the verified login token only (req.user, set in server.js).
// Usernames the browser sends in headers, query or body are not trusted.
export const resolveClientUsername = (req) =>
  normalizeUsername(req.user?.username || "");

// Admin/Staff/Driver screens see every supply. Only a verified token's role
// counts; the X-Role header is ignored.
export const isStaffRequest = (req) => {
  const role = String(req.user?.role || "").trim().toLowerCase();
  return Boolean(role) && role !== "user";
};

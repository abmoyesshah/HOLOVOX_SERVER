import jwt from "jsonwebtoken";

function readBearerToken(req) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

export function getAuthUserId(req) {
  const token = readBearerToken(req);
  if (!token || !process.env.JWT_SECRET) return "";

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof claims !== "object" || claims === null) return "";

    const userId =
      typeof claims.id === "string"
        ? claims.id
        : typeof claims._id === "string"
          ? claims._id
          : typeof claims.userId === "string"
            ? claims.userId
            : "";

    return userId;
  } catch {
    return "";
  }
}

export function resolveRequestUserId(req, candidateUserId) {
  const authUserId = getAuthUserId(req);
  if (!authUserId) return typeof candidateUserId === "string" ? candidateUserId : "";

  if (!candidateUserId) return authUserId;
  if (candidateUserId !== authUserId) {
    const err = new Error("User identity mismatch");
    err.name = "AuthIdentityMismatch";
    throw err;
  }

  return authUserId;
}

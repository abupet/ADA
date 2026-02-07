// backend/src/rbac.middleware.js v1
// PR 1: Role-Based Access Control middleware

/**
 * RBAC middleware for the promo system.
 *
 * Logic:
 * - req.user.sub === "ada-user" (legacy JWT) -> role "owner" or "vet" from X-Ada-Role header
 * - req.user.role present (JWT v2) -> verify against allowedRoles
 * - If route has :tenantId -> verify admin_brand.tenantId matches
 * - Super admin: cross-tenant access (logged)
 * - Injects req.promoAuth = { userId, role, tenantId }
 *
 * Usage:
 *   router.get("/api/admin/:tenantId/items", requireAuth, requireRole(['admin_brand','super_admin']), handler);
 */

function requireRole(allowedRoles) {
  if (!Array.isArray(allowedRoles)) {
    throw new Error("requireRole: allowedRoles must be an array");
  }
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "unauthorized" });

    // Legacy JWT (single-user auth)
    if (user.sub === "ada-user") {
      const legacyRole =
        req.headers["x-ada-role"] === "vet" ? "vet" : "owner";
      if (!allowedRoles.includes(legacyRole)) {
        return res.status(403).json({ error: "forbidden" });
      }
      req.promoAuth = { userId: "ada-user", role: legacyRole, tenantId: null };
      return next();
    }

    // V2 JWT
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const paramTenant = req.params.tenantId;
    if (
      paramTenant &&
      user.role === "admin_brand" &&
      user.tenantId !== paramTenant
    ) {
      return res.status(403).json({ error: "forbidden_cross_tenant" });
    }

    req.promoAuth = {
      userId: user.sub,
      role: user.role,
      tenantId:
        user.role === "super_admin" ? paramTenant || null : user.tenantId,
    };
    return next();
  };
}

module.exports = { requireRole };

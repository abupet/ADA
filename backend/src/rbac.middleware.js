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
      const headerRole = req.headers["x-ada-role"] || "";
      const legacyRole = (headerRole === "vet" || headerRole === "vet_int" || headerRole === "vet_ext") ? headerRole : "owner";
      // Map legacy 'vet' to 'vet_int' for new role system
      const effectiveRole = legacyRole === "vet" ? "vet_int" : legacyRole;
      // Check if allowed (accept both old 'vet' and new 'vet_int'/'vet_ext')
      const isAllowed = allowedRoles.includes(effectiveRole) ||
        ((effectiveRole === "vet_int" || effectiveRole === "vet_ext") && allowedRoles.includes("vet")) ||
        (legacyRole === "vet" && (allowedRoles.includes("vet_int") || allowedRoles.includes("vet_ext")));
      if (!isAllowed) {
        return res.status(403).json({ error: "forbidden" });
      }
      req.promoAuth = { userId: "ada-user", role: effectiveRole, tenantId: null };
      return next();
    }

    // V2 JWT — map vet_int/vet_ext to match routes that use 'vet'
    const userRole = user.role;
    const roleAllowed = allowedRoles.includes(userRole) ||
      ((userRole === "vet_int" || userRole === "vet_ext") && allowedRoles.includes("vet"));
    if (!roleAllowed) {
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

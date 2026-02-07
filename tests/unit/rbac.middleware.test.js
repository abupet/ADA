/* rbac.middleware.test.js
   Unit tests for RBAC middleware (requireRole).
   Run: node tests/unit/rbac.middleware.test.js
*/
const assert = require("assert");
const path = require("path");

const { requireRole } = require(path.join(__dirname, "../../backend/src/rbac.middleware"));

assert.strictEqual(typeof requireRole, "function", "requireRole must be exported");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockReq(user, headers, params) {
  return {
    user: user || null,
    headers: headers || {},
    params: params || {},
  };
}

function mockRes() {
  let _status = 200;
  let _body = null;
  return {
    status(code) { _status = code; return this; },
    json(data) { _body = data; return this; },
    getStatus() { return _status; },
    getBody() { return _body; },
  };
}

function runMiddleware(middleware, req) {
  const res = mockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test: requireRole throws on non-array
// ─────────────────────────────────────────────────────────────────────────────

(function testThrowsOnNonArray() {
  assert.throws(() => requireRole("owner"), /allowedRoles must be an array/);
  assert.throws(() => requireRole(null), /allowedRoles must be an array/);
  assert.throws(() => requireRole(42), /allowedRoles must be an array/);
  console.log("  PASS: requireRole throws on non-array argument");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: no user -> 401
// ─────────────────────────────────────────────────────────────────────────────

(function testNoUser401() {
  const mw = requireRole(["owner"]);
  const req = mockReq(null);
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(res.getStatus(), 401);
  assert.strictEqual(nextCalled, false);
  console.log("  PASS: no user -> 401 unauthorized");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: legacy JWT (ada-user) with X-Ada-Role header
// ─────────────────────────────────────────────────────────────────────────────

(function testLegacyJwtOwner() {
  const mw = requireRole(["owner", "vet"]);
  const req = mockReq({ sub: "ada-user" }, {});
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(nextCalled, true, "owner should pass");
  assert.deepStrictEqual(req.promoAuth, { userId: "ada-user", role: "owner", tenantId: null });
  console.log("  PASS: legacy JWT ada-user defaults to owner");
})();

(function testLegacyJwtVet() {
  const mw = requireRole(["vet"]);
  const req = mockReq({ sub: "ada-user" }, { "x-ada-role": "vet" });
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(nextCalled, true, "vet should pass");
  assert.strictEqual(req.promoAuth.role, "vet");
  console.log("  PASS: legacy JWT ada-user with X-Ada-Role: vet");
})();

(function testLegacyJwtForbidden() {
  const mw = requireRole(["admin_brand"]);
  const req = mockReq({ sub: "ada-user" }, {});
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(res.getStatus(), 403);
  assert.strictEqual(nextCalled, false);
  console.log("  PASS: legacy JWT denied for admin_brand role");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: V2 JWT with role in payload
// ─────────────────────────────────────────────────────────────────────────────

(function testV2JwtAdminBrand() {
  const mw = requireRole(["admin_brand", "super_admin"]);
  const req = mockReq(
    { sub: "user-123", role: "admin_brand", tenantId: "t1" },
    {},
    { tenantId: "t1" }
  );
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(nextCalled, true);
  assert.deepStrictEqual(req.promoAuth, { userId: "user-123", role: "admin_brand", tenantId: "t1" });
  console.log("  PASS: V2 JWT admin_brand with matching tenant");
})();

(function testV2JwtCrossTenantForbidden() {
  const mw = requireRole(["admin_brand"]);
  const req = mockReq(
    { sub: "user-123", role: "admin_brand", tenantId: "t1" },
    {},
    { tenantId: "t2" }
  );
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(res.getStatus(), 403);
  assert.deepStrictEqual(res.getBody(), { error: "forbidden_cross_tenant" });
  assert.strictEqual(nextCalled, false);
  console.log("  PASS: V2 JWT admin_brand cross-tenant -> 403");
})();

(function testV2JwtSuperAdmin() {
  const mw = requireRole(["super_admin"]);
  const req = mockReq(
    { sub: "admin-1", role: "super_admin" },
    {},
    { tenantId: "any-tenant" }
  );
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.promoAuth.tenantId, "any-tenant", "super_admin gets param tenant");
  assert.strictEqual(req.promoAuth.role, "super_admin");
  console.log("  PASS: V2 JWT super_admin cross-tenant access");
})();

(function testV2JwtWrongRole() {
  const mw = requireRole(["super_admin"]);
  const req = mockReq({ sub: "user-456", role: "owner" }, {}, {});
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(res.getStatus(), 403);
  assert.strictEqual(nextCalled, false);
  console.log("  PASS: V2 JWT wrong role -> 403");
})();

(function testV2JwtNoParamTenant_SuperAdmin() {
  const mw = requireRole(["super_admin"]);
  const req = mockReq({ sub: "admin-1", role: "super_admin" }, {}, {});
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.promoAuth.tenantId, null, "super_admin with no param tenant -> null");
  console.log("  PASS: super_admin without tenantId param -> tenantId null");
})();

(function testV2JwtAdminBrandNoParamTenant() {
  const mw = requireRole(["admin_brand"]);
  const req = mockReq({ sub: "user-789", role: "admin_brand", tenantId: "t1" }, {}, {});
  const { res, nextCalled } = runMiddleware(mw, req);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.promoAuth.tenantId, "t1", "admin_brand gets JWT tenant when no param");
  console.log("  PASS: admin_brand without tenantId param -> uses JWT tenantId");
})();

console.log("OK rbac.middleware.test.js");

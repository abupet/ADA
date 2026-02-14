// backend/src/seed.test-users.js v1
// Crea/aggiorna i 4 utenti test + tenant nel database.
// Eseguire: node backend/src/seed.test-users.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const bcrypt = require("bcryptjs");
const { getPool } = require("./db");

const TEST_PASSWORD = process.env.TEST_PASSWORD || process.env.ADA_TEST_PASSWORD;

const USERS = [
  {
    user_id: "test-super-admin-001",
    email: "super_admin_test@adiuvet.it",
    display_name: "SuperAdminTestName",
    base_role: "super_admin",
  },
  {
    user_id: "test-admin-brand-001",
    email: "admin_brand_test@adiuvet.it",
    display_name: "AdminBrandTestName",
    base_role: "admin_brand",
  },
  {
    user_id: "test-vet-001",
    email: "vet_test@adiuvet.it",
    display_name: "VetTestName",
    base_role: "vet_int",
  },
  {
    user_id: "test-owner-001",
    email: "owner_test@adiuvet.it",
    display_name: "OwnerTestName",
    base_role: "owner",
  },
];

async function main() {
  if (!TEST_PASSWORD) {
    console.error("ERROR: TEST_PASSWORD (or ADA_TEST_PASSWORD) non impostata in .env");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL non impostata in .env");
    process.exit(1);
  }

  const pool = getPool();
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);

  console.log("Seeding test tenant...");
  await pool.query(
    `INSERT INTO tenants (tenant_id, name, slug, status)
     VALUES ('tenant-test-001', 'Test Tenant', 'test-tenant', 'active')
     ON CONFLICT (tenant_id) DO UPDATE SET name = EXCLUDED.name, status = 'active'`
  );
  console.log("  ✅ Tenant 'Test Tenant' (tenant-test-001)");

  console.log("Seeding test users...");
  for (const u of USERS) {
    await pool.query(
      `INSERT INTO users (user_id, email, password_hash, display_name, base_role, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         display_name = EXCLUDED.display_name,
         base_role = EXCLUDED.base_role,
         status = 'active'`,
      [u.user_id, u.email, hash, u.display_name, u.base_role]
    );
    console.log(`  ✅ ${u.email} (${u.base_role})`);
  }

  console.log("Linking admin_brand to Test Tenant...");
  await pool.query(
    `INSERT INTO user_tenants (user_id, tenant_id, role)
     VALUES ('test-admin-brand-001', 'tenant-test-001', 'admin_brand')
     ON CONFLICT (user_id, tenant_id) DO NOTHING`
  );
  console.log("  ✅ admin_brand_test → Test Tenant");

  await pool.end();
  console.log("\nDone. Tutti i test user sono pronti.");
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});

import { test, expect } from "@playwright/test";

const requireLiveInCi = process.env.CI === "true";
const runLive = requireLiveInCi || process.env.E2E_LIVE_BACKEND === "true";

const creds = {
  admin: {
    username: process.env.E2E_ADMIN_USERNAME ?? "admin",
    password: process.env.E2E_ADMIN_PASSWORD ?? "Admin#12345",
  },
  opsManager: {
    username: process.env.E2E_OPS_USERNAME ?? "ops_manager",
    password: process.env.E2E_OPS_PASSWORD ?? "OpsManager#12345",
  },
  csAgent: {
    username: process.env.E2E_AGENT_USERNAME ?? "cs_agent",
    password: process.env.E2E_AGENT_PASSWORD ?? "CsAgent#12345",
  },
};

async function login(
  page: Parameters<typeof test>[0]["page"],
  username: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByPlaceholder("Enter username").fill(username);
  await page.getByPlaceholder("Enter password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Live backend smoke", () => {
  test.skip(
    !runLive,
    "Set E2E_LIVE_BACKEND=true to run live backend smoke tests locally",
  );

  test("administrator workflow: dashboard and admin users", async ({
    page,
  }) => {
    await login(page, creds.admin.username, creds.admin.password);
    // Administrator-only route smoke check.
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users$/);
  });

  test("operations manager workflow: logistics/shipment access", async ({
    page,
  }) => {
    await login(page, creds.opsManager.username, creds.opsManager.password);

    await page.goto("/shipments");
    await expect(page).toHaveURL(/\/shipments$/);

    await page.goto("/admin/users");
    await expect(page).not.toHaveURL(/\/admin\/users$/);
  });

  test("customer service workflow: after-sales/fulfillment access", async ({
    page,
  }) => {
    await login(page, creds.csAgent.username, creds.csAgent.password);

    await page.goto("/after-sales");
    await expect(page).toHaveURL(/\/after-sales$/);

    await page.goto("/fulfillment");
    await expect(page).toHaveURL(/\/fulfillment$/);
  });
});

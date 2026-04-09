import { test, expect } from "@playwright/test";

const explicitLive = process.env.E2E_LIVE_BACKEND;
const runLive =
  explicitLive === "true"
    ? true
    : explicitLive === "false"
      ? false
      : process.env.E2E_SKIP_LIVE_BACKEND !== "true";

const creds = {
  admin: {
    username: process.env.E2E_ADMIN_USERNAME ?? "admin",
    password: process.env.E2E_ADMIN_PASSWORD ?? "",
  },
  opsManager: {
    username: process.env.E2E_OPS_USERNAME ?? "ops_manager",
    password: process.env.E2E_OPS_PASSWORD ?? "",
  },
  csAgent: {
    username: process.env.E2E_AGENT_USERNAME ?? "cs_agent",
    password: process.env.E2E_AGENT_PASSWORD ?? "",
  },
};

const hasLiveCredentials =
  Boolean(creds.admin.password) &&
  Boolean(creds.opsManager.password) &&
  Boolean(creds.csAgent.password);

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
    !runLive || !hasLiveCredentials,
    "Set E2E_SKIP_LIVE_BACKEND=true (or E2E_LIVE_BACKEND=false), and provide E2E_*_PASSWORD values to run live backend smoke tests",
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

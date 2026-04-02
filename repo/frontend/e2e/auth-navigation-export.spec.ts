import { test, expect, Page } from "@playwright/test";

async function installAuthenticatedApiMocks(page: Page, role: string) {
  // Generic fallback first; specific routes below override this.
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          accessToken: "restored-access-token",
          refreshToken: "rotated-refresh-token",
          expiresIn: 3600,
        },
      }),
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "u-1",
          username: "restored-user",
          role,
        },
      }),
    });
  });

  await page.route("**/api/departments**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          data: [],
        },
      }),
    });
  });

  await page.route("**/api/students**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            data: [],
            total: 0,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
}

test("protected navigation redirects unauthenticated users to login", async ({
  page,
}) => {
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login/);
});

test("restores session from refresh token before protected route renders", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("refresh_token", "seeded-refresh-token");
  });

  await installAuthenticatedApiMocks(page, "administrator");

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("student export uses restored in-memory access token", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("refresh_token", "seeded-refresh-token");
  });

  let exportAuthorizationHeader = "";

  await installAuthenticatedApiMocks(page, "administrator");

  await page.route("**/api/students/export", async (route) => {
    exportAuthorizationHeader =
      route.request().headers()["authorization"] ?? "";
    await route.fulfill({
      status: 200,
      contentType: "text/csv",
      body: "studentNumber,fullName,email\nS1,Test User,test@example.com\n",
    });
  });

  await page.goto("/students");
  await page.getByRole("button", { name: /Export CSV/i }).click();

  await expect
    .poll(() => exportAuthorizationHeader)
    .toBe("Bearer restored-access-token");
});

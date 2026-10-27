import { expect, test } from "@playwright/test";

// Off prod the form needs no captcha and the message is logged, not emailed.

test("sends a message and shows the confirmation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Contact me" })).toBeVisible();
  await page.getByLabel("Subject").fill("E2E test");
  await page.getByLabel("Message").fill("Hello from the E2E tests.");
  await page.getByLabel("Your email").fill("e2e@example.com");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Thanks! Your message has been sent.");
  await expect(page.getByLabel("Message")).toHaveValue("");
});

test("checks the form before sending", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert")).toHaveText("Please write a message.");
  await page.getByLabel("Message").fill("Hello");
  await page.getByLabel("Your email").fill("not-an-address");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert")).toHaveText("Please enter a valid email address.");
});

test("shows the release in the footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".version")).not.toBeEmpty();
});

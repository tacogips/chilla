import { expect, test } from "@playwright/test";

const harnessPath = "/?harness=file-browser";

test.describe("file browser keyboard navigation", () => {
  test("moves focus and selection with j/k and confirms with l", async ({ page }) => {
    await page.goto(harnessPath);

    await page.waitForSelector('[data-testid="selected-path"]');
    await expect(page.getByTestId("selected-path")).toHaveText(
      "/workspace/bravo.md",
    );
    await expect(page.getByTestId("selected-index")).toHaveText("2");
    await expect(page.locator(".file-browser__button:focus")).toHaveAttribute(
      "data-path",
      "/workspace/bravo.md",
    );

    await page.keyboard.press("j");
    await expect(page.getByTestId("selected-path")).toHaveText(
      "/workspace/delta.md",
    );
    await expect(page.locator(".file-browser__button:focus")).toHaveAttribute(
      "data-path",
      "/workspace/delta.md",
    );

    await page.keyboard.press("j");
    await expect(page.getByTestId("selected-path")).toHaveText(
      "/workspace/echo.txt",
    );
    await expect(page.locator(".file-browser__button:focus")).toHaveAttribute(
      "data-path",
      "/workspace/echo.txt",
    );

    await page.keyboard.press("k");
    await expect(page.getByTestId("selected-path")).toHaveText(
      "/workspace/delta.md",
    );
    await expect(page.locator(".file-browser__button:focus")).toHaveAttribute(
      "data-path",
      "/workspace/delta.md",
    );

    await page.keyboard.press("l");
    await expect(page.getByTestId("confirmed-path")).toHaveText(
      "/workspace/delta.md",
    );
  });

  test("h triggers parent navigation while preserving list keyboard handling", async ({
    page,
  }) => {
    await page.goto(harnessPath);
    await expect(page.locator(".file-browser__button:focus")).toHaveAttribute(
      "data-path",
      "/workspace/bravo.md",
    );

    await page.keyboard.press("h");
    await expect(page.getByTestId("parent-count")).toHaveText("1");

    await page.keyboard.press("j");
    await expect(page.getByTestId("selected-path")).toHaveText(
      "/workspace/delta.md",
    );
  });
});

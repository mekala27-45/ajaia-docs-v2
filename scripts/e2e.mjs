// End to end browser check of the main reviewer flow.
//
//   BASE_URL=http://localhost:3000 node scripts/e2e.mjs
//
// Uses playwright-core with a Chrome that is already installed. Set
// CHROME_PATH if Chrome is not at the default Linux location. Screenshots are
// written to the folder in SHOTS_DIR (default: ./screenshots).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS_DIR = process.env.SHOTS_DIR ?? "screenshots";
const CHROME_PATH = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

const results = [];
let failed = false;

async function step(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (err) {
    failed = true;
    results.push(`FAIL  ${name}\n      ${String(err.message ?? err).split("\n")[0]}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function switchUser(page, name) {
  await page.getByTestId("user-switcher").click();
  await page.getByRole("menuitemradio", { name: new RegExp(name) }).click();
  await page.getByTestId("user-switcher").filter({ hasText: name }).waitFor();
}

async function waitSaved(page) {
  await page.locator('[data-testid="save-status"][data-state="saved"]').waitFor({ timeout: 15000 });
}

fs.mkdirSync(SHOTS_DIR, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: false });

// A remote BASE_URL may need an outbound proxy. Local runs never do.
const isLocal = /\/\/(localhost|127\.0\.0\.1)[:/]/.test(BASE_URL + "/");
const proxyServer = process.env.E2E_PROXY ?? (isLocal ? undefined : process.env.HTTPS_PROXY);
const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  args: ["--no-sandbox"],
  proxy: proxyServer ? { server: proxyServer } : undefined,
});
// Documents created along the way that no later step deletes.
const leftovers = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();

// Say what this run is pointed at before any step runs. A result is only
// useful when it is clear which server and which data it tested.
const health = await context.request
  .get(`${BASE_URL}/api/health`)
  .then((response) => response.json())
  .catch(() => null);
console.log(`Target: ${BASE_URL}`);
console.log(`Health: ${health ? JSON.stringify(health) : "no answer"}\n`);

const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(err.message));
page.on("console", (msg) => {
  // Two steps make the server answer 404 and 409 on purpose.
  if (msg.type() === "error" && !/\b(404|409)\b/.test(msg.text())) pageErrors.push(`console: ${msg.text()}`);
});

const title = `E2E plan ${Date.now()}`;
let docUrl = "";

await step("dashboard shows owned and shared documents for Alice", async () => {
  await page.goto(BASE_URL);
  await page.getByTestId("user-switcher").filter({ hasText: "Alice Chen" }).waitFor();
  const owned = await page.getByTestId("owned-documents").innerText();
  const shared = await page.getByTestId("shared-documents").innerText();
  expect(owned.includes("Welcome to Ajaia Docs"), "welcome doc missing from owned list");
  expect(shared.includes("Product sync notes"), "seeded shared doc missing");
  expect(shared.includes("View only"), "role badge missing on shared doc");
  await shot(page, "01-dashboard.png");
});

await step("create a document, rename it and format text", async () => {
  await page.getByTestId("new-document").click();
  await page.waitForURL(/\/d\/[0-9a-f-]{36}$/);
  docUrl = page.url();

  const titleInput = page.getByTestId("title-input");
  await titleInput.fill(title);
  await titleInput.press("Enter");

  const editor = page.getByTestId("editor");
  await editor.click();
  await page.getByTestId("block-style").selectOption("h1");
  await page.keyboard.type("Launch plan");
  await page.keyboard.press("Enter");
  await page.keyboard.type("This is ");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("bold");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type(", ");
  await page.getByRole("button", { name: "Italic" }).click();
  await page.keyboard.type("italic");
  await page.getByRole("button", { name: "Italic" }).click();
  await page.keyboard.type(" and ");
  await page.getByRole("button", { name: "Underline" }).click();
  await page.keyboard.type("underlined");
  await page.getByRole("button", { name: "Underline" }).click();
  await page.keyboard.type(" text.");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("First point");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second point");
  await waitSaved(page);
  await shot(page, "02-editor.png");
});

await step("content and formatting survive a reload", async () => {
  await page.reload();
  const editor = page.getByTestId("editor");
  await editor.waitFor();
  const html = await editor.innerHTML();
  expect(html.includes("<h1>Launch plan</h1>"), "heading lost");
  expect(html.includes("<strong>bold</strong>"), "bold lost");
  expect(html.includes("<em>italic</em>"), "italic lost");
  expect(html.includes("<u>underlined</u>"), "underline lost");
  expect(/<ul>.*First point.*Second point.*<\/ul>/s.test(html), "list lost");
  expect((await page.getByTestId("title-input").inputValue()) === title, "title lost");
});

await step("owner shares with Bob as editor and Carol as viewer", async () => {
  await page.getByTestId("share-button").click();
  await page.getByTestId("share-person").selectOption("u_bob");
  await page.getByTestId("share-submit").click();
  await page.getByTestId("share-row-u_bob").waitFor();
  await page.getByTestId("share-person").selectOption("u_carol");
  await page.getByLabel("Access for the new person").selectOption("viewer");
  await page.getByTestId("share-submit").click();
  await page.getByTestId("share-row-u_carol").waitFor();
  await shot(page, "03-share-dialog.png");
  await page.getByTestId("share-done").click();
});

await step("Bob sees it under Shared with me and can edit", async () => {
  await page.goto(BASE_URL);
  await switchUser(page, "Bob Patel");
  const shared = page.getByTestId("shared-documents");
  await shared.getByText(title).waitFor();
  const row = shared.getByTestId("document-row").filter({ hasText: title });
  expect((await row.innerText()).includes("Can edit"), "editor badge missing for Bob");
  expect((await row.innerText()).includes("Owner: Alice Chen"), "owner name missing for Bob");
  await shot(page, "04-shared-with-bob.png");

  await row.getByRole("link").click();
  const editor = page.getByTestId("editor");
  await editor.waitFor();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Added by Bob");
  await waitSaved(page);
  expect((await page.getByTestId("share-button").innerText()).includes("People"), "Bob should not get the owner Share button");
  expect((await page.getByRole("button", { name: /^Delete/ }).count()) === 0, "Bob should not see delete");
});

await step("Carol can read but not edit", async () => {
  await page.goto(BASE_URL);
  await switchUser(page, "Carol Reyes");
  const row = page.getByTestId("shared-documents").getByTestId("document-row").filter({ hasText: title });
  expect((await row.innerText()).includes("View only"), "viewer badge missing for Carol");
  await row.getByRole("link").click();
  const editor = page.getByTestId("editor");
  await editor.waitFor();
  expect((await editor.getAttribute("contenteditable")) === "false", "editor should be read only for a viewer");
  expect((await editor.innerText()).includes("Added by Bob"), "viewer should see the editor's change");
  expect((await page.getByRole("toolbar").count()) === 0, "viewer should not see the toolbar");
  expect(await page.getByText("You have view only access").isVisible(), "view only notice missing");
  await shot(page, "05-view-only.png");
});

await step("a person without access gets the not found page", async () => {
  // Carol opens a document only Alice and Bob can see: the seeded notes are
  // shared with Alice only, so use a fresh private document instead.
  await page.goto(BASE_URL);
  await switchUser(page, "Alice Chen");
  await page.getByTestId("new-document").click();
  await page.waitForURL(/\/d\/[0-9a-f-]{36}$/);
  const privateUrl = page.url();
  leftovers.push(privateUrl.split("/").pop());
  await page.goto(BASE_URL);
  await switchUser(page, "Carol Reyes");
  const response = await page.goto(privateUrl);
  expect(response.status() === 404, `expected 404, got ${response.status()}`);
  await page.getByText("Document not found").waitFor();
});

await step("import a .docx file into a new editable document", async () => {
  await page.goto(BASE_URL);
  await switchUser(page, "Alice Chen");
  await page.getByTestId("import-input").setInputFiles("samples/sample.docx");
  await page.waitForURL(/\/d\/[0-9a-f-]{36}$/);
  leftovers.push(page.url().split("/").pop());
  const editor = page.getByTestId("editor");
  await editor.waitFor();
  const html = await editor.innerHTML();
  expect(html.includes("Quarterly plan"), "imported heading missing");
  expect(html.includes("<strong>bold</strong>"), "imported bold missing");
  expect((await editor.getAttribute("contenteditable")) === "true", "imported document should be editable");
  await shot(page, "06-imported-docx.png");
});

await step("an unsupported file type is refused with a clear message", async () => {
  await page.goto(BASE_URL);
  await page.getByTestId("import-input").setInputFiles({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7"),
  });
  await page.getByText(".pdf files are not supported").waitFor();
  await shot(page, "07-import-rejected.png");
});

await step("a stale save is caught as a conflict and can be resolved", async () => {
  await page.goto(docUrl);
  const editor = page.getByTestId("editor");
  await editor.waitFor();

  // Bob saves a newer version from a second browser while Alice has the page open.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(BASE_URL);
  await switchUser(otherPage, "Bob Patel");
  await otherPage.goto(docUrl);
  await otherPage.getByTestId("editor").waitFor();

  // Both type at the same moment, Bob's save lands first.
  await otherPage.getByTestId("editor").click();
  await otherPage.keyboard.press("Control+End");
  await otherPage.keyboard.type(" Bob was here.");
  await otherPage.locator('[data-testid="save-status"][data-state="saved"]').waitFor();
  await editor.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Alice edit. ");
  await page.locator('[data-testid="save-status"][data-state="conflict"]').waitFor({ timeout: 15000 });
  await shot(page, "08-conflict.png");

  await page.getByTestId("conflict-keep-mine").click();
  await waitSaved(page);
  await page.reload();
  await page.getByTestId("editor").waitFor();
  expect((await page.getByTestId("editor").innerText()).includes("Alice edit."), "kept version was not saved");
  await other.close();
});

await step("an open document picks up changes saved by someone else", async () => {
  await page.goto(docUrl);
  await page.getByTestId("editor").waitFor();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(BASE_URL);
  await switchUser(otherPage, "Bob Patel");
  await otherPage.goto(docUrl);
  await otherPage.getByTestId("editor").click();
  await otherPage.keyboard.press("Control+End");
  await otherPage.keyboard.type(" Live update from Bob.");
  await otherPage.locator('[data-testid="save-status"][data-state="saved"]').waitFor();
  await page.getByText("Live update from Bob.").waitFor({ timeout: 15000 });
  await other.close();
});

await step("an open editor reacts when the owner changes or removes access", async () => {
  await page.goto(BASE_URL);
  await switchUser(page, "Alice Chen");
  const id = await page.evaluate(async () => {
    const response = await fetch("/api/documents", { method: "POST" });
    return (await response.json()).document.id;
  });
  const setRole = (role) =>
    page.evaluate(
      async ([docId, nextRole]) => {
        await fetch(`/api/documents/${docId}/shares`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: "u_bob", role: nextRole }),
        });
      },
      [id, role],
    );
  await setRole("editor");

  const other = await browser.newContext();
  const bob = await other.newPage();
  await bob.goto(BASE_URL);
  await switchUser(bob, "Bob Patel");
  await bob.goto(`${BASE_URL}/d/${id}`);
  await bob.locator('[data-testid="editor"][contenteditable="true"]').waitFor();

  await setRole("viewer");
  await bob.locator('[data-testid="editor"][contenteditable="false"]').waitFor({ timeout: 20000 });
  await bob.getByText("You have view only access").waitFor();

  await page.evaluate(async (docId) => {
    await fetch(`/api/documents/${docId}/shares/u_bob`, { method: "DELETE" });
  }, id);
  await bob.getByText("You no longer have access").waitFor({ timeout: 20000 });

  await page.evaluate(async (docId) => {
    await fetch(`/api/documents/${docId}`, { method: "DELETE" });
  }, id);
  await other.close();
});

await step("the dashboard and the editor fit a phone screen", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobile = await phone.newPage();
  await mobile.goto(BASE_URL);
  await mobile.getByTestId("owned-documents").waitFor();
  const fits = () => mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(await fits(), "dashboard scrolls sideways on a phone");
  await mobile.screenshot({ path: path.join(SHOTS_DIR, "09-phone-dashboard.png") });
  await mobile.goto(docUrl);
  await mobile.getByTestId("editor").waitFor();
  expect(await fits(), "editor page scrolls sideways on a phone");
  await mobile.screenshot({ path: path.join(SHOTS_DIR, "10-phone-editor.png") });
  await phone.close();
});

await step("owner deletes the document", async () => {
  await page.goto(docUrl);
  await page.getByRole("button", { name: /^Delete/ }).click();
  await page.getByTestId("confirm-delete").click();
  await page.waitForURL(BASE_URL.replace(/\/$/, "") + "/");
  await page.getByTestId("owned-documents").waitFor();
  expect((await page.getByTestId("owned-documents").getByText(title).count()) === 0, "deleted document still listed");
  const response = await page.goto(docUrl);
  expect(response.status() === 404, "deleted document should be gone");
});

await step("clean up the documents this run created", async () => {
  await page.goto(BASE_URL);
  await switchUser(page, "Alice Chen").catch(() => undefined);
  for (const id of leftovers) {
    const status = await page.evaluate(async (docId) => {
      const response = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      return response.status;
    }, id);
    expect(status === 200 || status === 404, `could not delete ${id}: ${status}`);
  }
});

await browser.close();

console.log(results.join("\n"));
if (pageErrors.length) console.log(`\nBrowser errors (${pageErrors.length}):\n` + [...new Set(pageErrors)].slice(0, 10).join("\n"));
process.exit(failed ? 1 : 0);

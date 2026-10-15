import { type Browser, chromium } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AuditOptions, audit } from "../src/audit.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

const doc = (body: string, css = "") =>
  `<!doctype html><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}${css}</style>${body}`;

async function auditHtml(html: string, width = 1280, height = 800, options?: AuditOptions) {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(html);
    return await audit(page, options);
  } finally {
    await page.close();
  }
}

describe("audit: font size", () => {
  it("passes a clean page", async () => {
    expect(await auditHtml(doc("<main><p>Hello</p></main>"))).toEqual([]);
  });

  it("flags text below 12px", async () => {
    expect(await auditHtml(doc('<p style="font-size:11px">Small</p>'))).toEqual([
      { kind: "font-size", element: "p", px: 11 },
    ]);
  });

  it("accepts exactly 12px and flags 11.99px", async () => {
    expect(await auditHtml(doc('<p style="font-size:12px">ok</p>'))).toEqual([]);
    expect(await auditHtml(doc('<p style="font-size:11.99px">no</p>'))).toEqual([
      { kind: "font-size", element: "p", px: 11.99 },
    ]);
  });

  it("reports repeated small text once per element and size", async () => {
    const html = doc('<p class="note" style="font-size:10px">a</p><p class="note" style="font-size:10px">b</p>');
    expect(await auditHtml(html)).toEqual([{ kind: "font-size", element: "p.note", px: 10 }]);
  });

  it("ignores text that is not rendered", async () => {
    const html = doc(`
      <p style="display:none;font-size:8px">hidden</p>
      <p style="visibility:hidden;font-size:8px">invisible</p>
      <script>/* 8px */ window.x = "text inside a script";</script>`);
    expect(await auditHtml(html)).toEqual([]);
  });
});

describe("audit: horizontal overflow", () => {
  it("flags an element wider than the viewport", async () => {
    const violations = await auditHtml(doc('<div style="width:2000px">wide</div>'), 390, 844);
    expect(violations).toEqual([expect.objectContaining({ kind: "overflow" })]);
  });

  it("passes content that fits", async () => {
    expect(await auditHtml(doc('<div style="width:300px">fits</div>'), 390, 844)).toEqual([]);
  });
});

describe("audit: centered content", () => {
  const capped = (extra: string) => doc("<main><p>Content</p></main>", `main{max-width:1536px;${extra}}`);

  it("passes a capped container with auto margins on a wide screen", async () => {
    expect(await auditHtml(capped("margin:0 auto"), 2560, 1440, { contentSelector: "main" })).toEqual([]);
  });

  it("flags a capped container pinned to the left on a wide screen", async () => {
    const violations = await auditHtml(capped(""), 2560, 1440, { contentSelector: "main" });
    expect(violations).toEqual([{ kind: "off-center", left: 0, right: 1024 }]);
  });

  it("passes a full-width container (0 and 0)", async () => {
    expect(await auditHtml(capped(""), 1280, 800, { contentSelector: "main" })).toEqual([]);
  });

  it("checks every element that matches the selector", async () => {
    const html = doc(
      '<section class="wrap" style="max-width:800px;margin:0 auto">a</section><section class="wrap" style="max-width:800px">b</section>',
    );
    const violations = await auditHtml(html, 1600, 900, { contentSelector: ".wrap" });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "off-center" });
  });

  it("throws when the selector matches nothing", async () => {
    await expect(auditHtml(doc("<p>x</p>"), 1280, 800, { contentSelector: ".missing" })).rejects.toThrow(/\.missing/);
  });
});

describe("audit: content cut off at the edge", () => {
  const clip = "html,body{overflow-x:clip}";

  it("flags text pushed past the right edge even when the page hides the overflow", async () => {
    const html = doc('<div style="width:2000px;text-align:right">cut off</div>', clip);
    const violations = await auditHtml(html, 390, 844);
    expect(violations).toEqual([expect.objectContaining({ kind: "clipped-text" })]);
  });

  it("flags text that starts before the left edge", async () => {
    const html = doc('<p style="margin-left:-200px">cut off</p>', clip);
    expect(await auditHtml(html, 390, 844)).toEqual([expect.objectContaining({ kind: "clipped-text" })]);
  });

  it("accepts text inside a container the user can scroll sideways", async () => {
    const html = doc('<div style="overflow-x:auto;width:300px"><p style="width:900px;text-align:right">scrollable</p></div>');
    expect(await auditHtml(html, 390, 844)).toEqual([]);
  });

  it("ignores visually hidden text meant only for screen readers", async () => {
    const srOnly = ".sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}";
    const html = doc('<div class="sr-only"><p style="width:2000px;margin-left:900px">for screen readers</p></div>', clip + srOnly);
    expect(await auditHtml(html, 390, 844)).toEqual([]);
  });

  it("still reports overflow when only the body hides it (the check is intentionally strict)", async () => {
    const html = doc('<div style="width:2000px">wide</div>', "body{overflow-x:hidden}");
    expect(await auditHtml(html, 390, 844)).toEqual([expect.objectContaining({ kind: "overflow" })]);
  });
});

import type { Page } from "@playwright/test";

export const MIN_FONT_PX = 12;

export type Violation =
  | { kind: "font-size"; element: string; px: number }
  | { kind: "overflow"; excess: number }
  | { kind: "clipped-text"; element: string; edge: "left" | "right" }
  | { kind: "off-center"; left: number; right: number };

export interface AuditOptions {
  contentSelector?: string;
}

export async function audit(page: Page, options: AuditOptions = {}): Promise<Violation[]> {
  return page.evaluate(
    ({ minFontPx, contentSelector }) => {
      const violations: Violation[] = [];

      const root = document.documentElement;
      const scrollsSideways = (start: Element | null) => {
        for (let el = start; el; el = el.parentElement) {
          const overflowX = getComputedStyle(el).overflowX;
          if (el !== root && el !== document.body && (overflowX === "auto" || overflowX === "scroll")) return true;
        }
        return false;
      };

      const visuallyHidden = (start: Element | null) => {
        for (let el = start; el; el = el.parentElement) {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 1 && rect.height <= 1) return true;
        }
        return false;
      };

      const found = new Map<string, Violation>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node.parentElement;
        if (!node.textContent?.trim() || !element) continue;
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(element.tagName)) continue;
        const style = getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
        if (rects.length === 0) continue;
        const firstClass = typeof element.className === "string" ? element.className.trim().split(/\s+/)[0] : "";
        const label = element.tagName.toLowerCase() + (firstClass ? `.${firstClass}` : "");
        const px = Number.parseFloat(style.fontSize);
        if (px < minFontPx) found.set(`${label}@${px}`, { kind: "font-size", element: label, px });
        if (scrollsSideways(element) || visuallyHidden(element)) continue;
        if (rects.some((rect) => rect.right > root.clientWidth + 1)) {
          found.set(`${label}>right`, { kind: "clipped-text", element: label, edge: "right" });
        }
        if (rects.some((rect) => rect.left < -1)) {
          found.set(`${label}>left`, { kind: "clipped-text", element: label, edge: "left" });
        }
      }
      violations.push(...found.values());

      const excess = root.scrollWidth - root.clientWidth;
      if (excess > 0) violations.push({ kind: "overflow", excess });

      if (contentSelector) {
        const containers = [...document.querySelectorAll(contentSelector)];
        if (containers.length === 0) throw new Error(`content selector matched nothing: ${contentSelector}`);
        for (const container of containers) {
          const rect = container.getBoundingClientRect();
          const left = Math.round(rect.left);
          const right = Math.round(root.clientWidth - rect.right);
          if (Math.abs(left - right) > 1) violations.push({ kind: "off-center", left, right });
        }
      }

      return violations;
    },
    { minFontPx: MIN_FONT_PX, contentSelector: options.contentSelector },
  );
}

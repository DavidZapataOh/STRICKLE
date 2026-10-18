import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { topicsFor } from "../src/docs/topics.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const langs = ["en", "es", "pt-br"] as const;
const shape = (lang: (typeof langs)[number]) => topicsFor(lang).map((topic) => [topic.slug, topic.sections.map((section) => section.id)]);

describe("documentation content", () => {
  it("has the same topics and sections in every language", () => {
    expect(shape("es")).toEqual(shape("en"));
    expect(shape("pt-br")).toEqual(shape("en"));
    expect(topicsFor("en").length).toBeGreaterThanOrEqual(6);
  });

  it("gives every section a title, a paragraph and sources that exist", () => {
    for (const lang of langs) {
      for (const topic of topicsFor(lang)) {
        expect(topic.title && topic.summary).toBeTruthy();
        for (const section of topic.sections) {
          expect(section.title).toBeTruthy();
          expect(section.body.length).toBeGreaterThan(0);
          expect(section.sources.length).toBeGreaterThan(0);
          for (const source of section.sources) expect(existsSync(join(root, source)), `${topic.slug}/${section.id}: ${source}`).toBe(true);
        }
      }
    }
  });

  it("makes no promise of safety, audit, insurance or guarantee", () => {
    const text = langs.flatMap((lang) => topicsFor(lang).flatMap((topic) => topic.sections.flatMap((section) => section.body))).join(" ").replace(/safe harbor/gi, "");
    expect(text).not.toMatch(/\b(safe|audited|insured|guaranteed|risk-free)\b|\bseguro\b|\bgarantizad|\bgarantid/i);
  });

  it("does not mention the private process", () => {
    const text = JSON.stringify(langs.map(topicsFor));
    expect(text).not.toMatch(/\bsprints?\b|\bS\d{2}\/\d{2}\b|PROYECTO/i);
  });
});

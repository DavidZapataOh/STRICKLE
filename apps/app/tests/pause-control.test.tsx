import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/dictionaries/en.json";
import { PauseControl } from "../src/components/PauseControl.tsx";

describe("PauseControl on the server", () => {
  it("renders nothing until the browser has found an account: no fake or disabled control", () => {
    expect(renderToStaticMarkup(<PauseControl lang="en" labels={en.pause} />)).toBe("");
  });
});

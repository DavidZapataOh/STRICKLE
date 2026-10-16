import type { Dictionary } from "./dictionaries";

/** What the data screens read. The server hands the browser this slice, not the whole dictionary: the onboarding strings are not sent to Home. */
export type DataText = Pick<Dictionary, "home" | "boxes" | "boxesPage" | "screens">;

export const dataText = (t: Dictionary): DataText => ({ home: t.home, boxes: t.boxes, boxesPage: t.boxesPage, screens: t.screens });

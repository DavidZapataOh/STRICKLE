import type { Dictionary } from "./dictionaries";

/** What the data screens read. The server hands the browser this slice, not the whole dictionary: the onboarding strings are not sent to Home. */
export type DataText = Pick<Dictionary, "home" | "boxes" | "boxesPage" | "screens">;

export const dataText = (t: Dictionary): DataText => ({ home: t.home, boxes: t.boxes, boxesPage: t.boxesPage, screens: t.screens });

/** What the Activity screen reads. */
export type ActivityText = Pick<Dictionary, "activity" | "boxes" | "screens"> & { start: { restore: Dictionary["start"]["restore"] } };

export const activityText = (t: Dictionary): ActivityText => ({ activity: t.activity, boxes: t.boxes, screens: t.screens, start: { restore: t.start.restore } });

/** What the Settings screen reads. */
export type SettingsText = Pick<Dictionary, "settings" | "pause" | "boxes" | "boxesPage" | "rules" | "view" | "screens">;

export const settingsText = (t: Dictionary): SettingsText => ({ settings: t.settings, pause: t.pause, boxes: t.boxes, boxesPage: t.boxesPage, rules: t.rules, view: t.view, screens: t.screens });

/** What the public account view reads. */
export type ViewText = Pick<Dictionary, "view" | "rules" | "boxes" | "boxesPage" | "screens">;

export const viewText = (t: Dictionary): ViewText => ({ view: t.view, rules: t.rules, boxes: t.boxes, boxesPage: t.boxesPage, screens: t.screens });

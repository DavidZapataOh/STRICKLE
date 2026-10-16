import type { Dictionary } from "./dictionaries";

/** What the data screens read. The server hands the browser this slice, not the whole dictionary: the onboarding strings are not sent to Home. */
export type DataText = Pick<Dictionary, "home" | "boxes" | "boxesPage" | "screens">;

export const dataText = (t: Dictionary): DataText => ({ home: t.home, boxes: t.boxes, boxesPage: t.boxesPage, screens: t.screens });

/** What the Activity screen reads. */
export type ActivityText = Pick<Dictionary, "activity" | "boxes" | "screens"> & { start: { restore: Dictionary["start"]["restore"] } };

export const activityText = (t: Dictionary): ActivityText => ({ activity: t.activity, boxes: t.boxes, screens: t.screens, start: { restore: t.start.restore } });

/** What the Settings screen reads. */
export type SettingsText = Pick<Dictionary, "settings" | "pause" | "boxes" | "screens">;

export const settingsText = (t: Dictionary): SettingsText => ({ settings: t.settings, pause: t.pause, boxes: t.boxes, screens: t.screens });

export interface Viewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export const VIEWPORTS: readonly Viewport[] = [
  { name: "w320", width: 320, height: 640 },
  { name: "w390", width: 390, height: 844 },
  { name: "w768", width: 768, height: 1024 },
  { name: "w1024", width: 1024, height: 768 },
  { name: "w1280", width: 1280, height: 800 },
  { name: "w1440", width: 1440, height: 900 },
  { name: "w1920", width: 1920, height: 1080 },
  { name: "w2560", width: 2560, height: 1440 },
  { name: "laptop-1280x720", width: 1280, height: 720 },
  { name: "phone-landscape", width: 844, height: 390 },
];

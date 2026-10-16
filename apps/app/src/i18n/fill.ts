export const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

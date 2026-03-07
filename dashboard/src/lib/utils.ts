export function toggleValue(current: string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

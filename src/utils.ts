export function notNull<T>(value: T): Exclude<T, null | undefined> {
  if (value === null || value === undefined) throw new Error("notNull violated");
  return value as Exclude<T, null | undefined>;
}

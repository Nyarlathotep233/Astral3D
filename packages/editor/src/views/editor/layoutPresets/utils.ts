import type { IncludeList } from "./types";

/** 未配置或 `*` 表示不限制；空数组表示全部隐藏 */
export function isIncludedInList<T extends string>(
  list: IncludeList<T> | undefined,
  key: T
): boolean {
  if (list === undefined || list === "*") return true;
  return list.includes(key);
}

export function listHasRestrictions<T extends string>(
  list: IncludeList<T> | undefined
): boolean {
  return list !== undefined && list !== "*";
}

export function filterByIncludeList<T extends string>(
  items: readonly T[],
  list: IncludeList<T> | undefined
): T[] {
  if (!listHasRestrictions(list)) return [...items];
  if (list === "*") return [...items];
  return items.filter((key) => list.includes(key));
}

export function filterItemsByKey<T extends { key: string }>(
  items: readonly T[],
  list: IncludeList<string> | undefined
): T[] {
  if (!listHasRestrictions(list)) return [...items];
  if (list === "*") return [...items];
  return items.filter((item) => list.includes(item.key));
}

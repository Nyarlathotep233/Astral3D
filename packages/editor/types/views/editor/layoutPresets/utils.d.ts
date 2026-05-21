import type { IncludeList } from "./types";
/** 未配置或 `*` 表示不限制；空数组表示全部隐藏 */
export declare function isIncludedInList<T extends string>(list: IncludeList<T> | undefined, key: T): boolean;
export declare function listHasRestrictions<T extends string>(list: IncludeList<T> | undefined): boolean;
export declare function filterByIncludeList<T extends string>(items: readonly T[], list: IncludeList<T> | undefined): T[];
export declare function filterItemsByKey<T extends {
    key: string;
}>(items: readonly T[], list: IncludeList<string> | undefined): T[];

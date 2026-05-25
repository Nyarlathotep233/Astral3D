export type ScriptParamType = "string" | "number" | "boolean" | "json";

export interface ScriptParamField {
	key: string;
	type: ScriptParamType;
	label: string;
	default: unknown;
	value: unknown;
	min?: number;
	max?: number;
	step?: number;
}

export interface ParseScriptParamsResult {
	fields: ScriptParamField[];
	error: string | null;
}

export interface ScriptParamSource {
	source?: string;
	params?: Record<string, unknown>;
}

const SCRIPT_PARAMS_BLOCK_RE = /\/\*\s*script-params\s*([\s\S]*?)\*\//i;
const PARAM_TYPES: ScriptParamType[] = ["string", "number", "boolean", "json"];

function isParamType(value: unknown): value is ScriptParamType {
	return typeof value === "string" && PARAM_TYPES.includes(value as ScriptParamType);
}

function isDetailedParamEntry(value: unknown): value is Record<string, unknown> & { type: ScriptParamType; default: unknown } {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;

	const entry = value as Record<string, unknown>;
	return isParamType(entry.type) && Object.prototype.hasOwnProperty.call(entry, "default");
}

function inferParamType(value: unknown): ScriptParamType {
	if (typeof value === "string") return "string";
	if (typeof value === "number") return "number";
	if (typeof value === "boolean") return "boolean";
	return "json";
}

function cloneParamValue<T = unknown>(value: T): T {
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return value;
	}
}

function validateValueForType(_key: string, type: ScriptParamType, value: unknown): boolean {
	switch (type) {
		case "string":
			return typeof value === "string";
		case "number":
			return typeof value === "number" && Number.isFinite(value);
		case "boolean":
			return typeof value === "boolean";
		case "json":
			return value !== undefined;
		default:
			return false;
	}
}

function normalizeNumberMeta(key: string, entry: Record<string, unknown>, field: ScriptParamField) {
	if (entry.min !== undefined) {
		if (typeof entry.min !== "number" || !Number.isFinite(entry.min)) {
			throw new Error(`参数「${key}」的 min 必须是有效数字`);
		}
		field.min = entry.min;
	}

	if (entry.max !== undefined) {
		if (typeof entry.max !== "number" || !Number.isFinite(entry.max)) {
			throw new Error(`参数「${key}」的 max 必须是有效数字`);
		}
		field.max = entry.max;
	}

	if (entry.step !== undefined) {
		if (typeof entry.step !== "number" || !Number.isFinite(entry.step) || entry.step <= 0) {
			throw new Error(`参数「${key}」的 step 必须是大于 0 的数字`);
		}
		field.step = entry.step;
	}
}

function normalizeParamField(key: string, raw: unknown): ScriptParamField {
	if (!key.trim()) {
		throw new Error("参数名不能为空");
	}

	if (!isDetailedParamEntry(raw)) {
		const type = inferParamType(raw);
		const defaultValue = cloneParamValue(raw);
		return {
			key,
			type,
			label: key,
			default: defaultValue,
			value: defaultValue,
		};
	}

	if (!validateValueForType(key, raw.type, raw.default)) {
		throw new Error(`参数「${key}」的 default 与 type 不匹配`);
	}

	const defaultValue = cloneParamValue(raw.default);
	const field: ScriptParamField = {
		key,
		type: raw.type,
		label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : key,
		default: defaultValue,
		value: defaultValue,
	};

	if (raw.type === "number") {
		normalizeNumberMeta(key, raw, field);
	}

	return field;
}

export function parseScriptParamsDeclaration(source = ""): ParseScriptParamsResult {
	const match = SCRIPT_PARAMS_BLOCK_RE.exec(source);
	if (!match) return { fields: [], error: null };

	try {
		const parsed = JSON.parse(match[1].trim());
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("script-params 内容必须是 JSON 对象");
		}

		const fields = Object.entries(parsed).map(([key, raw]) => normalizeParamField(key, raw));
		return { fields, error: null };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { fields: [], error: message };
	}
}

export function resolveScriptParamFields(script: ScriptParamSource = {}): ParseScriptParamsResult {
	return parseScriptParamsDeclaration(script.source || "");
}

export function mergeParamsWithFields(
	fields: ScriptParamField[],
	currentParams: Record<string, unknown> = {},
): Record<string, unknown> {
	const merged: Record<string, unknown> = {};

	for (const field of fields) {
		const stored = currentParams[field.key];
		merged[field.key] = stored !== undefined && validateValueForType(field.key, field.type, stored)
			? cloneParamValue(stored)
			: cloneParamValue(field.default);
	}

	return merged;
}

export function paramsEqual(
	a: Record<string, unknown> = {},
	b: Record<string, unknown> = {},
): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export function stringifyParamValue(value: unknown, type: ScriptParamType): string {
	if (type === "json") {
		return JSON.stringify(value ?? null, null, 2);
	}
	if (type === "boolean") {
		return value ? "true" : "false";
	}
	return String(value ?? "");
}

export function parseParamValue(raw: string, type: ScriptParamType): unknown {
	switch (type) {
		case "number": {
			const value = Number(raw);
			if (!raw.trim() || !Number.isFinite(value)) {
				throw new Error("必须是有效数字");
			}
			return value;
		}
		case "boolean":
			return raw === "true";
		case "json":
			try {
				return JSON.parse(raw);
			} catch {
				throw new Error("不是有效 JSON");
			}
		default:
			return raw;
	}
}

export function applyScriptParams(target: Record<string, unknown>, params: Record<string, unknown>) {
	for (const key of Object.keys(target)) {
		delete target[key];
	}
	Object.assign(target, params);
}

export function syncScriptParamsFromSource(script: ScriptParamSource): { params: Record<string, unknown>; error: string | null } {
	const currentParams = script.params || {};
	const { fields, error } = resolveScriptParamFields(script);
	if (error) {
		return { params: currentParams, error };
	}

	if (fields.length === 0) {
		if (script.params && Object.keys(script.params).length > 0) {
			applyScriptParams(script.params, {});
		}
		return { params: script.params || {}, error: null };
	}

	if (!script.params) {
		script.params = {};
	}

	const merged = mergeParamsWithFields(fields, script.params);
	if (!paramsEqual(script.params, merged)) {
		applyScriptParams(script.params, merged);
	}

	return { params: script.params, error: null };
}

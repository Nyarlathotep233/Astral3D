<template>
	<!-- TODO 后面有文档了再添加文档链接 -->
	<!-- <EsDocument url="http://editor-doc.astraljs.com/guide/component/h4v1bkyh/" /> -->

	<div v-if="isSelectObject3D" class="script-panel">
		<div v-if="scripts.length" class="script-list">
			<div v-for="(item, index) in scripts" :key="index" class="script-card">
				<div class="script-card__header">
					<EsInput
						class="script-name-input"
						size="small"
						defaultNoBorder
						v-model:value="item.name"
						@change="n => handleNameChange(item, n)"
					/>
					<div class="script-card__actions">
						<n-button size="small" tertiary @click="handleEdit(item.script)">
							{{ t("layout.sider.script.Edit") }}
						</n-button>
						<n-button size="small" tertiary type="error" @click="handleRemove(item.script)">
							{{ t("layout.sider.script.Remove") }}
						</n-button>
					</div>
				</div>

				<div class="script-params">
					<n-alert v-if="item.paramsError" type="error" class="script-params__error" :show-icon="false">
						{{ item.paramsError }}
					</n-alert>

					<n-empty
						v-else-if="item.fields.length === 0"
						size="small"
						description="在脚本源码注释中声明参数后，将在此显示运行时取值"
						class="script-params__empty"
					/>

					<div v-else class="script-param-rows">
						<div
							v-for="field in item.fields"
							:key="field.key"
							class="script-param-row"
							:class="{ 'script-param-row--textarea': field.type === 'json' }"
						>
							<div class="script-param-row__label" :title="field.key">{{ field.label }}</div>

							<n-switch
								v-if="field.type === 'boolean'"
								:value="field.value === true"
								size="small"
								class="script-param-row__switch"
								@update:value="v => handleParamChange(item, field.key, v)"
							/>

							<n-input-number
								v-else-if="field.type === 'number'"
								:value="field.value as number"
								size="small"
								class="script-param-row__value"
								:min="field.min"
								:max="field.max"
								:step="field.step ?? 1"
								@update:value="v => handleParamChange(item, field.key, v ?? field.default)"
							/>

							<n-input
								v-else-if="field.type === 'string'"
								:value="String(field.value ?? '')"
								size="small"
								clearable
								class="script-param-row__value"
								@update:value="v => handleParamChange(item, field.key, v)"
							/>

							<n-input
								v-else
								:value="field.jsonText"
								type="textarea"
								size="small"
								:autosize="{ minRows: 2, maxRows: 6 }"
								class="script-param-row__value"
								placeholder='例如：{"x":0}'
								@update:value="v => handleJsonParamInput(item, field.key, v)"
								@blur="() => commitJsonParam(item, field.key)"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>

		<n-empty v-else size="small" description="当前对象暂无脚本" class="script-empty" />

		<div class="w-full text-center mt-2">
			<n-button size="small" type="primary" @click="handleNew">{{ t("layout.sider.script.New") }}</n-button>
		</div>
	</div>

	<n-result v-else class="mt-6" status="418" title="Empty" :description="t('prompt[\'No object selected.\']')" />
</template>

<script setup lang="ts">
	import { onBeforeUnmount, onMounted, ref, toRaw, h } from "vue";
	import * as THREE from "three";
	import { NInput } from "naive-ui";
	import { t } from "@/language";
	import { App, Hooks, SetScriptValueCommand, RemoveScriptCommand, AddScriptCommand, Script as AstralScript } from "@astral3d/engine";
	import EsInput from "@/components/es/EsInput.vue";

	const isSelectObject3D = ref(false);

	interface ScriptParamFieldView {
		key: string;
		type: "string" | "number" | "boolean" | "json";
		label: string;
		default: unknown;
		value: unknown;
		min?: number;
		max?: number;
		step?: number;
		jsonText?: string;
	}

	interface ScriptListItem {
		script: IScript.IStruct;
		name: string;
		fields: ScriptParamFieldView[];
		paramsError: string;
	}

	const scripts = ref<ScriptListItem[]>([]);
	const paramCommitTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const PARAM_DEBOUNCE_MS = 300;

	onMounted(() => {
		Hooks.useAddSignal("objectSelected", objectSelected);
		Hooks.useAddSignal("scriptAdded", updateUI);
		Hooks.useAddSignal("scriptRemoved", updateUI);
		Hooks.useAddSignal("scriptChanged", onScriptChanged);
	});
	onBeforeUnmount(() => {
		Hooks.useRemoveSignal("objectSelected", objectSelected);
		Hooks.useRemoveSignal("scriptAdded", updateUI);
		Hooks.useRemoveSignal("scriptRemoved", updateUI);
		Hooks.useRemoveSignal("scriptChanged", onScriptChanged);
		paramCommitTimers.forEach(timer => clearTimeout(timer));
		paramCommitTimers.clear();
	});

	function objectSelected(object) {
		if (object !== null && App.camera !== object) {
			isSelectObject3D.value = true;
			updateUI();
		} else {
			isSelectObject3D.value = false;
		}
	}

	function buildScriptListItem(sc: IScript.IStruct): ScriptListItem {
		const synced = AstralScript.syncScriptParamsFromSource(sc);
		const { fields, error } = AstralScript.resolveScriptParamFields(sc);
		const viewFields = error
			? []
			: fields.map(field => ({
					...field,
					value: synced.params[field.key] ?? field.default,
					jsonText: field.type === "json" ? AstralScript.stringifyParamValue(synced.params[field.key] ?? field.default, "json") : undefined,
				}));

		return {
			script: sc,
			name: sc.name,
			fields: viewFields,
			paramsError: error || synced.error || "",
		};
	}

	function updateUI() {
		const object = App.selected;
		if (object === null) return;

		scripts.value = [];
		App.scripts[object.uuid]?.forEach((sc: IScript.IStruct) => {
			scripts.value.push(buildScriptListItem(sc));
		});
	}

	function onScriptChanged(_attributeName: string, object: THREE.Object3D) {
		if (App.selected?.uuid !== object.uuid) return;
		updateUI();
	}

	function timerKey(item: ScriptListItem) {
		return item.script.name;
	}

	function getField(item: ScriptListItem, key: string) {
		return item.fields.find(field => field.key === key);
	}

	function buildParamsFromFields(item: ScriptListItem) {
		const params: Record<string, unknown> = {};

		for (const field of item.fields) {
			params[field.key] = field.value;
		}

		return params;
	}

	function scheduleParamCommit(item: ScriptListItem) {
		const key = timerKey(item);
		const existing = paramCommitTimers.get(key);
		if (existing) clearTimeout(existing);

		paramCommitTimers.set(
			key,
			setTimeout(() => {
				paramCommitTimers.delete(key);
				commitParams(item);
			}, PARAM_DEBOUNCE_MS)
		);
	}

	function handleParamChange(item: ScriptListItem, key: string, value: unknown) {
		const field = getField(item, key);
		if (!field) return;

		field.value = value;
		scheduleParamCommit(item);
	}

	function handleJsonParamInput(item: ScriptListItem, key: string, text: string) {
		const field = getField(item, key);
		if (!field) return;

		field.jsonText = text;
	}

	function commitJsonParam(item: ScriptListItem, key: string) {
		const field = getField(item, key);
		if (!field || field.type !== "json") return;

		try {
			const value = AstralScript.parseParamValue(field.jsonText || "null", "json");
			field.value = value;
			field.jsonText = AstralScript.stringifyParamValue(value, "json");
			commitParams(item);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			window.$message?.error(`参数「${field.label}」：${message}`);
		}
	}

	function commitParams(item: ScriptListItem) {
		if (!App.selected) return;

		const params = buildParamsFromFields(item);

		for (const field of item.fields) {
			if (field.type === "json") {
				try {
					AstralScript.parseParamValue(field.jsonText || "null", "json");
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					window.$message?.error(`参数「${field.label}」：${message}`);
					return;
				}
			}
		}

		if (AstralScript.paramsEqual(item.script.params || {}, params)) return;

		App.execute(new SetScriptValueCommand(App.selected, item.script, "params", params));
	}

	function handleNew() {
		const v = ref("");
		const status = ref("");

		window.$dialog.warning({
			title: t("layout.sider.script['Please enter the script name']"),
			content: () =>
				h(NInput, {
					modelValue: v.value,
					placeholder: "",
					clearable: true,
					size: "small",
					status: status.value,
					onUpdateValue: (n: string) => {
						v.value = n;
						status.value = !v.value ? "error" : "";
					},
					onBlur: () => {
						status.value = !v.value ? "error" : "";
					},
				}),
			positiveText: t("other.Ok"),
			negativeText: t("other.Cancel"),
			onPositiveClick: () => {
				if (!v.value || !App.selected) return false;

				if (App.scripts[App.selected.uuid]?.find(s => s.name === v.value)) {
					window.$message?.error(t("layout.sider.script['The script name already exists']"));
					return false;
				}

				const script = { name: v.value, source: AstralScript.Source };
				App.execute(new AddScriptCommand(App.selected, script));
			},
		});
	}

	function handleNameChange(item: ScriptListItem, name: string) {
		if (!App.selected) return;

		if (!name) {
			item.name = item.script.name;
			return;
		}

		if (name === item.script.name) return;

		if (App.scripts[App.selected.uuid]?.some(s => s !== item.script && s.name === name)) {
			window.$message?.error(t("layout.sider.script['The script name already exists']"));
			item.name = item.script.name;
			return;
		}

		App.execute(new SetScriptValueCommand(App.selected, item.script, "name", name));
	}

	function handleEdit(script: IScript.IStruct) {
		Hooks.useDispatchSignal("editScript", App.selected, toRaw(script));
	}

	function handleRemove(script: IScript.IStruct) {
		window.$dialog.warning({
			title: t("other.warning"),
			content: t("core['Any unsaved data will be lost. Are you sure?']"),
			positiveText: t("other.Ok"),
			negativeText: t("other.Cancel"),
			onPositiveClick: () => {
				if (!App.selected) return;
				App.execute(new RemoveScriptCommand(App.selected, toRaw(script)));
			},
		});
	}
</script>

<style scoped lang="less">
	.script-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.script-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.script-card {
		border: 1px solid var(--n-border-color);
		border-radius: 10px;
		background: var(--n-color);
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
		overflow: hidden;
	}

	.script-card__header {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		background: linear-gradient(180deg, rgba(24, 160, 88, 0.07), rgba(24, 160, 88, 0));
	}

	.script-name-input {
		min-width: 0;
		font-weight: 600;
	}

	.script-card__actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		flex-wrap: wrap;
	}

	.script-params {
		padding: 10px;
	}

	.script-params__empty {
		margin: 0;
		padding: 8px 0;
		border: 1px dashed var(--n-border-color);
		border-radius: 8px;
		background: rgba(127, 127, 127, 0.03);
	}

	.script-param-rows {
		border: 1px solid var(--n-border-color);
		border-radius: 8px;
		overflow: hidden;
		background: rgba(127, 127, 127, 0.03);
	}

	.script-param-row {
		display: grid;
		grid-template-columns: minmax(64px, 30%) minmax(0, 1fr);
		align-items: center;
		column-gap: 8px;
		min-height: 32px;
		padding: 4px 6px;
		border-bottom: 1px solid var(--n-border-color);

		&:last-child {
			border-bottom: 0;
		}

		&:hover {
			background: rgba(127, 127, 127, 0.05);
		}
	}

	.script-param-row--textarea {
		align-items: start;
		padding-top: 7px;
		padding-bottom: 7px;

		.script-param-row__label {
			padding-top: 5px;
		}
	}

	.script-param-row__label {
		font-size: 12px;
		font-weight: 500;
		color: var(--n-text-color-2);
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.script-param-row__value {
		min-width: 0;
		width: 100%;
	}

	.script-param-row__switch {
		justify-self: start;
	}

	.script-params__error {
		margin-top: 0;
	}

	.script-empty {
		padding: 18px 0;
		border: 1px dashed var(--n-border-color);
		border-radius: 10px;
		background: rgba(127, 127, 127, 0.03);
	}
</style>

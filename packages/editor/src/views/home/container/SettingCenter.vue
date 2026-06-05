<template>
	<div class="setting-center-container home-module-panel">
		<SettingTabs class="setting-home-tabs" />
	</div>
</template>

<style scoped lang="less">
.setting-center-container {
	height: 100%;
	padding: 20px;
	overflow: hidden;
	border: 1px solid rgba(255, 255, 255, 0.10);
	border-radius: 28px;
	background:
		linear-gradient(135deg, rgba(var(--home-primary-rgb), 0.10), transparent 32%),
		rgba(7, 11, 23, 0.62);
	box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 24px 80px rgba(0, 0, 0, 0.22);
	backdrop-filter: blur(18px);
}

.setting-home-tabs {
	height: 100%;
	display: flex;
	flex-direction: column;

	:deep(.n-tabs-nav) {
		padding-bottom: 18px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	:deep(.n-tabs-tab) {
		color: rgba(255, 255, 255, 0.64);
		font-weight: 700;
	}

	:deep(.n-tabs-tab--active) {
		color: var(--home-primary-hover);
	}

	:deep(.n-tabs-bar) {
		background-color: var(--home-primary);
		box-shadow: 0 0 20px rgba(var(--home-primary-rgb), 0.45);
	}

	:deep(.n-tabs-content),
	:deep(.n-tabs-pane-wrapper) {
		flex: 1;
		min-height: 0;
	}

	:deep(.n-tab-pane) {
		height: 100%;
		padding-top: 18px !important;
	}

	:deep(.n-form) {
		max-width: 640px;
		padding: 22px;
		border: 1px solid rgba(255, 255, 255, 0.10);
		border-radius: 22px;
		background: rgba(255, 255, 255, 0.05);
	}

	:deep(.n-form-item-label),
	:deep(.n-radio__label) {
		color: rgba(255, 255, 255, 0.78);
	}

	:deep(.n-input) {
		background: rgba(255, 255, 255, 0.07);
		border-radius: 12px;
	}

	:deep(.n-result) {
		margin: 64px auto 0;
		padding: 36px;
		max-width: 520px;
		border: 1px solid rgba(255, 255, 255, 0.10);
		border-radius: 26px;
		background: rgba(255, 255, 255, 0.05);
	}
}
</style>

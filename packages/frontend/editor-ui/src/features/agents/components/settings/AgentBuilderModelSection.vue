<script setup lang="ts">
import { N8nButton, N8nHeading, N8nInput, N8nInputLabel, N8nText } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { computed } from 'vue';
import { useToast } from '@/app/composables/useToast';
import { useAgentBuilderSettingsStore } from '../../agentBuilderSettings.store';

const i18n = useI18n();
const toast = useToast();
const store = useAgentBuilderSettingsStore();

const modelName = computed(() => {
	const settings = store.effectiveSettings;
	if (settings.mode === 'custom') return settings.modelName;
	return 'anthropic.claude-sonnet-4-6-v1';
});

function onModelChange(value: string) {
	store.setCustomSelection({
		provider: 'aws-bedrock',
		credentialId: 'iam-role',
		modelName: value,
	});
}

const canSave = computed(() => store.isDirty);

async function onSave() {
	try {
		await store.save();
		toast.showMessage({
			type: 'success',
			title: i18n.baseText('settings.agentBuilder.saved'),
		});
	} catch (error) {
		toast.showError(error, i18n.baseText('settings.agentBuilder.saveError'));
	}
}

function onCancel() {
	store.discardDraft();
}
</script>

<template>
	<div :class="$style.section">
		<N8nHeading tag="h2" size="small">
			{{ i18n.baseText('settings.agentBuilder.section.model') }}
		</N8nHeading>

		<N8nText tag="p" size="small" color="text-light">
			{{ i18n.baseText('settings.agentBuilder.section.help') }}
		</N8nText>

		<N8nInputLabel label="Bedrock Model ID" :bold="false" size="small">
			<N8nInput
				:model-value="modelName"
				size="small"
				placeholder="anthropic.claude-sonnet-4-6-v1"
				@update:model-value="onModelChange"
			/>
		</N8nInputLabel>

		<div v-if="canSave" :class="$style.actions">
			<N8nButton type="secondary" size="small" @click="onCancel">
				{{ i18n.baseText('generic.cancel') }}
			</N8nButton>
			<N8nButton size="small" :loading="store.isSaving" @click="onSave">
				{{ i18n.baseText('generic.save') }}
			</N8nButton>
		</div>
	</div>
</template>

<style lang="scss" module>
.section {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
}

.actions {
	display: flex;
	justify-content: flex-end;
	gap: var(--spacing--xs);
}
</style>

import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Placeholder credential type for built-in LLM providers that authenticate via
 * infrastructure (e.g. ECS task role) and never load a user-provisioned secret.
 * Registered solely so `<CredentialIcon credential-type-name="builtin" />`
 * resolves to a real icon in the Chat Hub UI.
 */
export class BuiltIn implements ICredentialType {
	name = 'builtin';

	displayName = 'Built-in';

	documentationUrl = '';

	icon = { light: 'file:icons/BuiltIn.svg', dark: 'file:icons/BuiltIn.dark.svg' } as const;

	// Never surfaced in the "New credential" picker.
	__skipManagedCreation = true;

	properties: INodeProperties[] = [];
}

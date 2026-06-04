/**
 * Canonical "if you have one of THIS credential type, this is the LLM provider
 * + model the builder may select when auto-resolving." Used by the ask_llm tool
 * when there's exactly one LLM-provider credential available.
 *
 * Provider strings match the catalog IDs used by `@n8n/agents`'s
 * `.model(provider, model)` call (see editor-ui's provider-mapping.ts for the
 * other side of this contract).
 *
 * Keep this list narrow — when the canonical default is unclear (e.g. Bedrock,
 * Azure variants), omit the entry so the tool falls through to suspending and
 * lets the user pick explicitly.
 *
 * `modelLookup` (optional) points at the chat-model node whose
 * `@searchListMethod` or routing-based `loadOptions` returns the live list of
 * model ids for the provider. When set, `resolve_llm` validates user-requested
 * model strings against that list. When absent, the requested model is passed
 * through unchanged.
 */
export type ModelLookupConfig =
	| {
			kind: 'listSearch';
			nodeType: string;
			version: number;
			methodName: string;
	  }
	| {
			kind: 'loadOptionsRouting';
			nodeType: string;
			version: number;
			propertyName: string;
	  };

export interface LlmProviderDefault {
	provider: string;
	defaultModel: string;
	modelLookup?: ModelLookupConfig;
}

export const LLM_PROVIDER_DEFAULTS: Record<string, LlmProviderDefault> = {
	awsBedrockApi: {
		provider: 'aws-bedrock',
		defaultModel: 'us.anthropic.claude-opus-4-6-v1',
	},
};

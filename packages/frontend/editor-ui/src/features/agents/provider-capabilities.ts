/**
 * Static capability map for LLM providers the agent runtime can target.
 * Used by the Behavior panel to decide whether the Thinking toggle is
 * available for the currently-selected provider and which sub-control to
 * show (Anthropic → budget tokens, OpenAI → reasoning effort).
 */
export interface ProviderCapabilities {
	thinking: false | 'budgetTokens' | 'reasoningEffort';
}

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
	'aws-bedrock': { thinking: 'budgetTokens' },
};

export const REASONING_EFFORT_OPTIONS = ['low', 'medium', 'high'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORT_OPTIONS)[number];

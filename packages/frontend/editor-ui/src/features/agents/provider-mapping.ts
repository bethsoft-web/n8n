import type { ChatHubLLMProvider } from '@n8n/api-types';

/**
 * Maps ChatHub provider IDs to Agent SDK catalog IDs.
 * Only AWS Bedrock is supported.
 */
export const CHATHUB_TO_CATALOG: Record<string, string> = {
	awsBedrock: 'aws-bedrock',
	awsBedrockBuiltIn: 'aws-bedrock',
};

/**
 * Reverse mapping: catalog ID → ChatHub provider ID.
 */
export const CATALOG_TO_CHATHUB: Record<string, ChatHubLLMProvider> = {};
for (const [chatHub, catalog] of Object.entries(CHATHUB_TO_CATALOG)) {
	if (!(catalog in CATALOG_TO_CHATHUB)) {
		CATALOG_TO_CHATHUB[catalog] = chatHub as ChatHubLLMProvider;
	}
}

/**
 * ChatHub provider IDs that the @n8n/agents runtime does not support.
 * These are filtered out in the Agents UI so users cannot select them.
 */
export const AGENT_UNSUPPORTED_PROVIDERS = new Set<string>([]);

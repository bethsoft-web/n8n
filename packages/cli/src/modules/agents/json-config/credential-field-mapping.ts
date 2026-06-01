import type { ResolvedCredential } from '@n8n/agents';

type CredMapper = (raw: ResolvedCredential) => Record<string, unknown>;

/**
 * Maps a raw n8n credential record onto the shape expected by the AI SDK
 * for the given provider prefix (e.g. 'aws-bedrock', 'azure-openai').
 *
 * n8n credential field names come from the credential type definitions
 * (e.g. Aws.credentials.ts, AzureOpenAiApi.credentials.ts) and differ
 * from what the AI SDK expects. Each mapper normalises the names.
 *
 * Providers not listed here pass through unchanged — they only need `apiKey`
 * and optionally `baseURL`, which are already present in most credential types.
 */
const PROVIDER_CREDENTIAL_MAPPERS: Record<string, CredMapper> = {
	// Aws.credentials.ts → region, accessKeyId, secretAccessKey, sessionToken
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'aws-bedrock': (c) => ({
		region: c.region,
		accessKeyId: c.accessKeyId,
		secretAccessKey: c.secretAccessKey,
		sessionToken: c.sessionToken,
	}),
};

/**
 * Given a provider prefix (derived from the `model` string before the first `/`)
 * and a resolved credential record, return a new record with field names remapped
 * to what the AI SDK provider expects.
 *
 * Falls back to the raw record when no mapper is registered for that provider.
 */
export function mapCredentialForProvider(
	provider: string,
	raw: ResolvedCredential,
): Record<string, unknown> {
	const mapper = PROVIDER_CREDENTIAL_MAPPERS[provider];
	if (!mapper) return raw as Record<string, unknown>;
	// Strip undefined values so they don't shadow existing keys in the Zod parse.
	const mapped = mapper(raw);
	return Object.fromEntries(Object.entries(mapped).filter(([, v]) => v !== undefined));
}

/** Provider IDs the agents runtime knows how to map a credential for. */
export const SUPPORTED_AGENT_PROVIDERS = Object.keys(
	PROVIDER_CREDENTIAL_MAPPERS,
) as readonly string[];

/** Whether a given provider id has a registered credential mapper. */
export function isSupportedAgentProvider(provider: string): boolean {
	return provider in PROVIDER_CREDENTIAL_MAPPERS;
}

import { z } from 'zod';

/**
 * Per-provider Zod schemas for credential validation.
 * Only AWS Bedrock is supported — credentials are optional since the
 * AWS SDK default credential chain (ECS task role) is used.
 */
export const PROVIDER_CREDENTIAL_SCHEMAS = {
	'aws-bedrock': z.object({
		region: z.string().optional(),
		accessKeyId: z.string().optional(),
		secretAccessKey: z.string().optional(),
		sessionToken: z.string().optional(),
	}),
} as const;

export type ProviderId = keyof typeof PROVIDER_CREDENTIAL_SCHEMAS;
export type ProviderCredentials<P extends ProviderId> = z.infer<
	(typeof PROVIDER_CREDENTIAL_SCHEMAS)[P]
>;

export interface ProviderCapability {
	field: string;
	type: 'number' | 'select';
	label: string;
	default: number | string;
	options?: string[];
}

export const providerCapabilities: Record<
	string,
	{
		thinking?: ProviderCapability;
	}
> = {
	'aws-bedrock': {
		thinking: { field: 'budgetTokens', type: 'number', label: 'Budget Tokens', default: 10000 },
	},
};

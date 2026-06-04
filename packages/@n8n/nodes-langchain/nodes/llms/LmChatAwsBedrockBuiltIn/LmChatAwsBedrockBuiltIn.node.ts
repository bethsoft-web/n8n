import type { BedrockRuntimeClientConfig } from '@aws-sdk/client-bedrock-runtime';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { ChatBedrockConverse } from '@langchain/aws';
import {
	getNodeProxyAgent,
	makeN8nLlmFailedAttemptHandler,
	N8nLlmTracing,
	getConnectionHintNoticeField,
} from '@n8n/ai-utilities';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

export class LmChatAwsBedrockBuiltIn implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AWS Bedrock Chat Model (Built-in)',

		name: 'lmChatAwsBedrockBuiltIn',
		icon: 'file:bedrock.svg',
		group: ['transform'],
		version: 1,
		description: 'Built-in AWS Bedrock language model using IAM role credentials',
		defaults: {
			name: 'AWS Bedrock Chat Model (Built-in)',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/foundation-models.html',
					},
				],
			},
		},

		inputs: [],

		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [],
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiChain, NodeConnectionTypes.AiChain]),
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: 'us.anthropic.claude-opus-4-6-v1',
				description: 'The Bedrock model ID or inference profile ARN to use for completion.',
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokensToSample',
						default: 2000,
						description: 'The maximum number of tokens to generate in the completion',
						type: 'number',
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.7,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const modelName = this.getNodeParameter('model', itemIndex) as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as {
			temperature: number;
			maxTokensToSample: number;
		};

		// Determine region from ARN if provided, otherwise use env default
		// ARN format: arn:aws:bedrock:<region>:<account-id>:inference-profile/<profile-id>
		let region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
		const arnMatch = modelName.match(/^arn:aws:bedrock:([a-z0-9-]+):/);
		if (arnMatch) {
			region = arnMatch[1];
		}

		// Client uses IAM role credentials from the environment (ECS task role)
		const proxyAgent = getNodeProxyAgent();
		const clientConfig: BedrockRuntimeClientConfig = {
			region,
		};

		if (proxyAgent) {
			clientConfig.requestHandler = new NodeHttpHandler({
				httpAgent: proxyAgent,
				httpsAgent: proxyAgent,
			});
		}

		const client = new BedrockRuntimeClient(clientConfig);

		const model = new ChatBedrockConverse({
			client,
			model: modelName,
			region,
			temperature: options.temperature,
			maxTokens: options.maxTokensToSample,
			callbacks: [new N8nLlmTracing(this)],
			onFailedAttempt: makeN8nLlmFailedAttemptHandler(this),
		});

		return {
			response: model,
		};
	}
}

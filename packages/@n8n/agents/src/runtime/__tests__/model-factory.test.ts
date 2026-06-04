import type { LanguageModel } from 'ai';

import { createModel } from '../model-factory';

jest.mock('@ai-sdk/amazon-bedrock', () => ({
	createAmazonBedrock:
		(opts?: {
			region?: string;
			accessKeyId?: string;
			secretAccessKey?: string;
			sessionToken?: string;
			fetch?: typeof globalThis.fetch;
		}) =>
		(model: string) => ({
			provider: 'aws-bedrock',
			modelId: model,
			region: opts?.region,
			accessKeyId: opts?.accessKeyId,
			secretAccessKey: opts?.secretAccessKey,
			fetch: opts?.fetch,
			specificationVersion: 'v3',
		}),
}));

const mockProxyAgent = jest.fn();
jest.mock('undici', () => ({
	ProxyAgent: mockProxyAgent,
}));

describe('createModel', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		delete process.env.HTTPS_PROXY;
		delete process.env.HTTP_PROXY;
		mockProxyAgent.mockClear();
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	it('should accept a string config', () => {
		const model = createModel(
			'aws-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0',
		) as unknown as Record<string, unknown>;
		expect(model.provider).toBe('aws-bedrock');
		expect(model.modelId).toBe('us.anthropic.claude-sonnet-4-20250514-v1:0');
	});

	it('should accept an object config with credentials', () => {
		const model = createModel({
			id: 'aws-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0',
			region: 'us-west-2',
			accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
			secretAccessKey: 'secret',
		}) as unknown as Record<string, unknown>;
		expect(model.provider).toBe('aws-bedrock');
		expect(model.region).toBe('us-west-2');
		expect(model.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
	});

	it('should pass through a prebuilt LanguageModel', () => {
		const prebuilt = {
			doGenerate: jest.fn(),
			doStream: jest.fn(),
			specificationVersion: 'v2' as const,
			modelId: 'custom-model',
			provider: 'custom',
			defaultObjectGenerationMode: undefined,
		} as unknown as LanguageModel;

		const result = createModel(prebuilt);
		expect(result).toBe(prebuilt);
	});

	it('should handle model IDs with multiple slashes', () => {
		const model = createModel(
			'aws-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0:0',
		) as unknown as Record<string, unknown>;
		expect(model.provider).toBe('aws-bedrock');
		expect(model.modelId).toBe('us.anthropic.claude-sonnet-4-20250514-v1:0:0');
	});

	it('should not pass fetch when no proxy env vars are set', () => {
		const model = createModel(
			'aws-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0',
		) as unknown as Record<string, unknown>;
		expect(model.fetch).toBeUndefined();
	});

	it('should pass proxy-aware fetch when HTTPS_PROXY is set', () => {
		process.env.HTTPS_PROXY = 'http://proxy:8080';
		const model = createModel(
			'aws-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0',
		) as unknown as Record<string, unknown>;
		expect(model.fetch).toBeInstanceOf(Function);
		expect(mockProxyAgent).toHaveBeenCalledWith('http://proxy:8080');
	});

	it('should pass proxy-aware fetch when HTTP_PROXY is set', () => {
		process.env.HTTP_PROXY = 'http://proxy:9090';
		const model = createModel(
			'aws-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0',
		) as unknown as Record<string, unknown>;
		expect(model.fetch).toBeInstanceOf(Function);
		expect(mockProxyAgent).toHaveBeenCalledWith('http://proxy:9090');
	});

	it('should prefer HTTPS_PROXY over HTTP_PROXY', () => {
		process.env.HTTPS_PROXY = 'http://https-proxy:8080';
		process.env.HTTP_PROXY = 'http://http-proxy:9090';
		createModel('aws-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0');
		expect(mockProxyAgent).toHaveBeenCalledWith('http://https-proxy:8080');
	});

	describe('aws-bedrock', () => {
		it('should create model with AWS credentials', () => {
			const model = createModel({
				id: 'aws-bedrock/amazon.titan-text-lite-v1',
				region: 'us-east-1',
				accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
				secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
			}) as unknown as Record<string, unknown>;
			expect(model.provider).toBe('aws-bedrock');
			expect(model.modelId).toBe('amazon.titan-text-lite-v1');
			expect(model.region).toBe('us-east-1');
			expect(model.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
		});

		it('should work without explicit credentials (IAM credential chain)', () => {
			const model = createModel('aws-bedrock/amazon.titan-text-lite-v1') as unknown as Record<
				string,
				unknown
			>;
			expect(model.provider).toBe('aws-bedrock');
			expect(model.modelId).toBe('amazon.titan-text-lite-v1');
		});

		it('should work with only region specified', () => {
			const model = createModel({
				id: 'aws-bedrock/amazon.titan-text-lite-v1',
				region: 'us-east-1',
			}) as unknown as Record<string, unknown>;
			expect(model.provider).toBe('aws-bedrock');
			expect(model.modelId).toBe('amazon.titan-text-lite-v1');
		});
	});

	describe('unsupported provider', () => {
		it('should throw for openai', () => {
			expect(() => createModel('openai/gpt-4')).toThrow(/Unsupported provider: "openai"/);
		});

		it('should include supported providers in the error message', () => {
			expect(() => createModel('unknown-provider/some-model')).toThrow(/Supported providers:/);
		});

		it('should throw when no model ID is provided', () => {
			expect(() => createModel('')).toThrow(/Model ID is required/);
		});

		it('should throw when model has no slash', () => {
			expect(() => createModel('bedrock-only')).toThrow(/expected "provider\/model-name"/);
		});
	});
});

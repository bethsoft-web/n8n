import type {
	ChatModelsResponse,
	ChatModelDto,
	ChatHubSessionDto,
	ChatHubMessageDto,
	ChatHubConversationResponse,
	MessageChunk,
	ChatHubModuleSettings,
	ChatHubAgentDto,
	ChatHubAgentKnowledgeItem,
} from '@n8n/api-types';
import { emptyChatModelsResponse } from '@n8n/api-types';
import type { ChatMessage } from '../chat.types';

export type SimulateMessageChunkFn = (
	type: MessageChunk['type'],
	content: string,
	metadata: Partial<MessageChunk['metadata']>,
) => void;

export function wrapOnMessageUpdate(fn: (chunk: MessageChunk) => void) {
	return (...[type, content, metadata]: Parameters<SimulateMessageChunkFn>) =>
		fn(createMockStreamChunk({ type, content, metadata }));
}

export function createMockAgent(overrides: Partial<ChatModelDto> = {}): ChatModelDto {
	return {
		name: 'Test Agent',
		description: 'A test agent',
		model: { provider: 'awsBedrock', model: 'us.anthropic.claude-sonnet-4-20250514-v1:0' },
		icon: null,
		updatedAt: '2024-01-15T12:00:00Z',
		createdAt: '2024-01-15T12:00:00Z',
		metadata: {
			allowFileUploads: true,
			allowedFilesMimeTypes: 'text/*',
			capabilities: {
				functionCalling: true,
			},
			available: true,
		},
		groupName: null,
		groupIcon: null,
		...overrides,
	};
}

export function createMockModelsResponse(
	overrides: Partial<ChatModelsResponse> = {},
): ChatModelsResponse {
	return {
		...emptyChatModelsResponse,
		awsBedrock: {
			models: [
				createMockAgent({
					name: 'Claude Sonnet',
					model: { provider: 'awsBedrock', model: 'us.anthropic.claude-sonnet-4-20250514-v1:0' },
				}),
			],
		},
		...overrides,
	};
}

export function createMockSession(overrides: Partial<ChatHubSessionDto> = {}): ChatHubSessionDto {
	return {
		id: 'session-123',
		title: 'Test Conversation',
		ownerId: 'user-123',
		lastMessageAt: null,
		credentialId: null,
		provider: 'awsBedrock',
		model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
		workflowId: null,
		agentId: null,
		agentName: 'gpt-4',
		agentIcon: null,
		type: 'production',
		createdAt: '2024-01-15T12:00:00Z',
		updatedAt: '2024-01-15T12:00:00Z',
		toolIds: [],
		...overrides,
	};
}

export function createMockMessageDto(
	overrides: Partial<ChatHubMessageDto> = {},
): ChatHubMessageDto {
	return {
		id: 'message-123',
		sessionId: 'session-123',
		type: 'human',
		name: 'User',
		content: [{ type: 'text', content: 'Test message' }],
		status: 'success',
		provider: null,
		model: null,
		workflowId: null,
		agentId: null,
		executionId: null,
		previousMessageId: null,
		retryOfMessageId: null,
		revisionOfMessageId: null,
		attachments: [],
		createdAt: '2024-01-15T12:00:00Z',
		updatedAt: '2024-01-15T12:00:00Z',
		...overrides,
	};
}

export function createMockMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		...createMockMessageDto(overrides),
		responses: [],
		alternatives: [],
		attachments: [],
		...overrides,
	};
}

export function createMockConversationResponse(
	overrides: Partial<ChatHubConversationResponse> = {},
): ChatHubConversationResponse {
	return {
		session: createMockSession(),
		conversation: { messages: {} },
		...overrides,
	};
}

export function createMockStreamChunk(
	overrides: Partial<Omit<MessageChunk, 'metadata'>> & {
		metadata?: Partial<MessageChunk['metadata']>;
	} = {},
): MessageChunk {
	const { metadata, ...rest } = overrides;
	return {
		type: 'item',
		content: 'Test content',
		...rest,
		metadata: {
			timestamp: Date.now(),
			messageId: 'message-123',
			previousMessageId: null,
			retryOfMessageId: null,
			executionId: null,
			...metadata,
		},
	};
}

export function createMockKnowledgeItem(
	overrides: Partial<ChatHubAgentKnowledgeItem> = {},
): ChatHubAgentKnowledgeItem {
	return {
		id: 'file-1',
		type: 'embedding',
		provider: 'awsBedrock',
		fileName: 'document.pdf',
		mimeType: 'application/pdf',
		status: 'indexed',
		...overrides,
	};
}

export function createMockAgentDto(overrides: Partial<ChatHubAgentDto> = {}): ChatHubAgentDto {
	return {
		id: 'agent-1',
		name: 'Test Agent',
		description: null,
		icon: null,
		suggestedPrompts: [],
		systemPrompt: '',
		ownerId: 'user-1',
		credentialId: null,
		provider: 'awsBedrock',
		model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
		files: [],
		toolIds: [],
		createdAt: '',
		updatedAt: '',
		...overrides,
	};
}

export function createChatHubModuleSettings(
	overrides: Partial<ChatHubModuleSettings> = {},
): ChatHubModuleSettings {
	return {
		enabled: true,
		semanticSearch: {
			vectorStore: { provider: 'qdrant', credentialId: null },
			embeddingModel: { provider: 'awsBedrock', credentialId: null },
		},
		agentUploadMaxSizeMb: 10,
		providers: {
			awsBedrock: {
				provider: 'awsBedrock',
				credentialId: null,
				allowedModels: [],
				createdAt: '2025-12-18T09:07:29.060Z',
				updatedAt: null,
				enabled: true,
			},
		},
		...overrides,
	};
}

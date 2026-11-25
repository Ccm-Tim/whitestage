export type AiProvider = 'openai-compatible' | 'custom'

export interface AiConfig {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  model: '',
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: string[]
  files?: { name: string; type: string; data: string }[]
}

export interface AiToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface AiChatResult {
  content: string
  toolCalls?: { name: string; arguments: Record<string, unknown> }[]
}

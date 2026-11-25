import type { AiChatResult, AiConfig, AiMessage, AiToolDefinition } from './types'

/**
 * AI 聊天接口的预留实现。
 *
 * 目前不做任何网络请求，API Key 只保存在本机。
 * 后续接入时在这里实现 OpenAI-compatible / 自定义协议的请求，
 * 并把工具调用转给 src/agent/commands.ts 的 executeAgentCommand。
 */
export async function aiChat(
  _config: AiConfig,
  _messages: AiMessage[],
  _tools?: AiToolDefinition[],
): Promise<AiChatResult> {
  throw new Error('AI 对话接口已预留，当前版本尚未启用网络请求')
}

export function isAiConfigured(config: AiConfig): boolean {
  return !!(config.baseUrl.trim() && config.model.trim())
}

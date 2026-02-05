import Anthropic from '@anthropic-ai/sdk';
import { createChildLogger } from '../utils/logger';

const logger = createChildLogger({ service: 'anthropic' });

/**
 * Message role types for Anthropic API
 */
export type MessageRole = 'user' | 'assistant';

/**
 * Conversation message
 */
export interface ConversationMessage {
  role: MessageRole;
  content: string;
}

/**
 * Chat response from Anthropic
 */
export interface ChatResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * AnthropicService - Direct communication with Claude API
 *
 * Used for Telegram conversations that don't need to go through containers.
 * This is a lightweight alternative to the full Claude Code daemon.
 */
class AnthropicService {
  private client: Anthropic | null = null;
  private readonly model = 'claude-sonnet-4-20250514';
  private readonly maxTokens = 1024;

  /**
   * System prompt for Telegram assistant
   */
  private readonly systemPrompt = `Voce eh um assistente pessoal no Telegram chamado DevForge Bot.

Suas responsabilidades:
- Responder perguntas de forma concisa e util
- Ajudar com duvidas sobre programacao e tecnologia
- Ser amigavel e prestativo

Regras:
- Respostas devem ser curtas (max 500 caracteres quando possivel)
- Use emojis ocasionalmente para tornar a conversa mais agradavel
- Sempre responda em portugues brasileiro
- Nao mencione que voce eh Claude ou da Anthropic, apenas responda naturalmente

Importante: Voce NAO tem acesso aos containers do usuario. Para operacoes em containers, instrua o usuario a usar comandos como /list, /select, e /exec.`;

  /**
   * Get or create the Anthropic client
   */
  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env['ANTHROPIC_API_KEY'];

      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not configured. Set it in your .env file.');
      }

      this.client = new Anthropic({ apiKey });
      logger.info('Anthropic client initialized');
    }

    return this.client;
  }

  /**
   * Check if the service is available (API key configured)
   */
  isAvailable(): boolean {
    return !!process.env['ANTHROPIC_API_KEY'];
  }

  /**
   * Send a single message and get a response
   *
   * @param message - User message
   * @returns Response from Claude
   */
  async chat(message: string): Promise<ChatResponse> {
    const client = this.getClient();

    logger.debug({ messageLength: message.length }, 'Sending message to Anthropic');

    const response = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    // Extract text from response
    const textContent = response.content.find((block) => block.type === 'text');
    const text = textContent && 'text' in textContent ? textContent.text : '';

    logger.debug(
      {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        responseLength: text.length,
      },
      'Received response from Anthropic'
    );

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    };
  }

  /**
   * Send a message with conversation history
   *
   * @param messages - Conversation history
   * @returns Response from Claude
   */
  async chatWithHistory(messages: ConversationMessage[]): Promise<ChatResponse> {
    const client = this.getClient();

    logger.debug({ messageCount: messages.length }, 'Sending conversation to Anthropic');

    const response = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    // Extract text from response
    const textContent = response.content.find((block) => block.type === 'text');
    const text = textContent && 'text' in textContent ? textContent.text : '';

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    };
  }
}

// Export singleton instance
export const anthropicService = new AnthropicService();

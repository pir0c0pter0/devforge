import type { BotContext } from './telegram.types';
import { commandRegistry } from './commands/command.registry';
import { containerRepository } from '../repositories/container.repository';
import { createChildLogger } from '../utils/logger';

const logger = createChildLogger({ service: 'telegram-conversation' });

/**
 * Intent types for natural language understanding
 */
export type IntentType =
  | 'command_suggestion'
  | 'help'
  | 'status'
  | 'list'
  | 'select'
  | 'queue'
  | 'instruction'
  | 'unknown';

/**
 * Detected intent from natural language
 */
export interface Intent {
  /** Type of intent detected */
  type: IntentType;
  /** Confidence level (0-1) */
  confidence: number;
  /** Suggested command to execute (if applicable) */
  suggestedCommand?: string;
  /** Response message for the user */
  response?: string;
  /** Extracted entities (container name, etc.) */
  entities?: Record<string, string>;
}

/**
 * Natural language pattern for intent detection
 */
interface PatternDefinition {
  /** Regular expression to match */
  pattern: RegExp;
  /** Intent type when matched */
  intent: IntentType;
  /** Suggested command */
  command?: string;
  /** Confidence score for this pattern */
  confidence: number;
  /** Group index for entity extraction */
  entityGroup?: number;
  /** Entity name to extract */
  entityName?: string;
}

/**
 * ConversationHandler - Handles natural language messages
 *
 * Analyzes user messages to:
 * - Detect intent and suggest appropriate commands
 * - Extract entities (container names, instructions)
 * - Provide helpful responses when intent is unclear
 * - Route to Claude when user has a container selected
 */
export class ConversationHandler {
  /**
   * Natural language patterns mapped to intents
   * Patterns are tested in order, first match wins
   */
  private readonly patterns: readonly PatternDefinition[] = [
    // Help patterns
    {
      pattern: /^(ajuda|help|comandos?|o\s+que\s+(voc[eê]|vc)\s+(faz|pode)|como\s+(uso|usar|funciona))/i,
      intent: 'help',
      command: '/help',
      confidence: 0.9,
    },

    // List patterns
    {
      pattern: /^(listar?|mostrar?|ver|quais?\s+s[aã]o)\s*(os\s+)?(containers?|projetos?|meus)/i,
      intent: 'list',
      command: '/list',
      confidence: 0.85,
    },
    {
      pattern: /^(containers?|projetos?)$/i,
      intent: 'list',
      command: '/list',
      confidence: 0.7,
    },

    // Status patterns
    {
      pattern: /^(status|como\s+est[aá]|estat[ií]sticas?|situa[çc][aã]o)/i,
      intent: 'status',
      command: '/status',
      confidence: 0.85,
    },

    // Queue patterns
    {
      pattern: /^(fila|queue|pendentes?|instru[çc][oõ]es?\s+pendentes?)/i,
      intent: 'queue',
      command: '/queue',
      confidence: 0.85,
    },
    {
      pattern: /^(ver|mostrar?)\s+(a\s+)?fila/i,
      intent: 'queue',
      command: '/queue',
      confidence: 0.8,
    },

    // Select patterns with entity extraction
    {
      pattern: /^(selecionar?|escolher?|usar?|ativar?)\s+(.+)/i,
      intent: 'select',
      command: '/select',
      confidence: 0.85,
      entityGroup: 2,
      entityName: 'containerName',
    },
    {
      pattern: /^(quero|vou|vamos)\s+(usar?|trabalhar)\s+(com\s+)?(.+)/i,
      intent: 'select',
      command: '/select',
      confidence: 0.75,
      entityGroup: 4,
      entityName: 'containerName',
    },

    // Instruction patterns (when user has container selected)
    {
      pattern: /^(executar?|rodar?|fazer?|executar?)\s+(.+)/i,
      intent: 'instruction',
      confidence: 0.7,
      entityGroup: 2,
      entityName: 'instruction',
    },
  ];

  /**
   * Detect intent from natural language text
   *
   * @param text - User message text
   * @returns Detected intent with confidence and suggestions
   */
  detectIntent(text: string): Intent {
    const trimmedText = text.trim();

    // Test each pattern
    for (const def of this.patterns) {
      const match = trimmedText.match(def.pattern);

      if (match) {
        const intent: Intent = {
          type: def.intent,
          confidence: def.confidence,
          suggestedCommand: def.command,
        };

        // Extract entities if configured
        const entityValue = def.entityGroup !== undefined ? match[def.entityGroup] : undefined;
        if (def.entityGroup !== undefined && def.entityName && entityValue !== undefined) {
          intent.entities = {}
          intent.entities[def.entityName] = entityValue.trim()
        }

        logger.debug(
          { text: trimmedText, intent: def.intent, confidence: def.confidence },
          'Intent detected'
        );

        return intent;
      }
    }

    // No pattern matched - check if it could be an instruction
    if (trimmedText.length > 10) {
      return {
        type: 'instruction',
        confidence: 0.5,
        entities: { instruction: trimmedText },
      };
    }

    // Unknown intent
    return {
      type: 'unknown',
      confidence: 0,
    };
  }

  /**
   * Generate response for detected intent
   *
   * @param intent - Detected intent
   * @param ctx - Bot context with session
   * @returns Response message for the user
   */
  generateResponse(intent: Intent, ctx: BotContext): string {
    const hasSelectedContainer = !!ctx.session?.selectedContainerId;
    let containerName: string | undefined;

    if (hasSelectedContainer) {
      const container = containerRepository.findById(ctx.session.selectedContainerId!);
      containerName = container?.name;
    }

    switch (intent.type) {
      case 'help':
        return `\u{1F4A1} Entendi! Use /help para ver todos os comandos disponíveis.`;

      case 'list':
        return `\u{1F4A1} Entendi! Executando /list...\n\n_Aguarde a lista de containers_`;

      case 'status':
        if (hasSelectedContainer && containerName) {
          return `\u{1F4CA} Verificando status de *${containerName}*...\n\nUse /status para ver detalhes completos.`;
        }
        return `\u{1F4CA} Parece que você quer ver o status.\n\n_Nenhum container selecionado._\nUse /list para ver seus containers e /select para selecionar um.`;

      case 'queue':
        if (hasSelectedContainer && containerName) {
          return `\u{1F4CB} Verificando fila de *${containerName}*...\n\nUse /queue para ver detalhes.`;
        }
        return `\u{1F4CB} Para ver a fila de instruções, primeiro selecione um container.\n\nUse /list para ver seus containers.`;

      case 'select': {
        const targetName = intent.entities ? intent.entities['containerName'] : undefined;
        if (targetName) {
          return `\u{1F4A1} Entendi! Executando /select ${targetName}...`;
        }
        return `\u{1F4A1} Para selecionar um container, use /select <nome>\n\nExemplo: \`/select api-backend\``;
      }

      case 'instruction': {
        if (hasSelectedContainer && containerName) {
          const instruction = intent.entities ? intent.entities['instruction'] : undefined;
          const instructionText = instruction || 'sua instrução';
          return `\u{1F4E4} Enviando para *${containerName}*:\n\n_"${this.truncate(instructionText, 100)}"_\n\n_Aguarde a resposta do Claude..._`;
        }
        return `\u{1F4AC} Para enviar instruções ao Claude, primeiro selecione um container.\n\n1. Use /list para ver seus containers\n2. Use /select <nome> para selecionar\n3. Envie sua instrução`;
      }

      case 'unknown':
      default:
        if (hasSelectedContainer && containerName) {
          return `\u{2753} Não entendi sua mensagem.\n\n*Container ativo:* ${containerName}\n\n*Dicas:*\n• Digite sua instrução para enviar ao Claude\n• Use /help para ver comandos`;
        }
        return `\u{2753} Não entendi sua mensagem.\n\nUse /help para ver os comandos disponíveis ou selecione um container para enviar instruções.`;
    }
  }

  /**
   * Handle a natural language message
   *
   * @param ctx - Bot context
   */
  async handle(ctx: BotContext): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;

    if (!text) {
      return;
    }

    // Update session activity
    if (ctx.session) {
      ctx.session.lastActivity = new Date();
    }

    // Detect intent
    const intent = this.detectIntent(text);

    logger.info(
      {
        userId: ctx.from?.id,
        text: this.truncate(text, 50),
        intent: intent.type,
        confidence: intent.confidence,
        hasSelectedContainer: !!ctx.session?.selectedContainerId,
      },
      'Processing natural language message'
    );

    // High confidence: execute suggested command
    if (intent.confidence >= 0.8 && intent.suggestedCommand) {
      await this.executeSuggestedCommand(ctx, intent);
      return;
    }

    // Medium confidence: confirm before executing
    if (intent.confidence >= 0.6 && intent.suggestedCommand) {
      await this.suggestCommand(ctx, intent);
      return;
    }

    // Low confidence or instruction: check if container selected
    if (intent.type === 'instruction' && ctx.session?.selectedContainerId) {
      // Let the message router handle sending to Claude
      return;
    }

    // Generate and send response
    const response = this.generateResponse(intent, ctx);
    await ctx.reply(response, { parse_mode: 'Markdown' });
  }

  /**
   * Execute a suggested command directly
   */
  private async executeSuggestedCommand(ctx: BotContext, intent: Intent): Promise<void> {
    const commandName = intent.suggestedCommand?.replace('/', '') || '';
    const command = commandRegistry.get(commandName);

    if (!command) {
      const response = this.generateResponse(intent, ctx);
      await ctx.reply(response, { parse_mode: 'Markdown' });
      return;
    }

    // Build args from entities
    const args: string[] = [];
    const entityContainerName = intent.entities ? intent.entities['containerName'] : undefined;
    if (entityContainerName) {
      args.push(entityContainerName);
    }

    // Send hint message
    const hint = `\u{1F4A1} Entendi! Executando ${intent.suggestedCommand}...`;
    await ctx.reply(hint);

    // Execute the command
    await command.execute(ctx, args);
  }

  /**
   * Suggest a command without executing
   */
  private async suggestCommand(ctx: BotContext, intent: Intent): Promise<void> {
    const entityContainerName = intent.entities ? intent.entities['containerName'] : undefined;
    const commandStr = entityContainerName
      ? `${intent.suggestedCommand} ${entityContainerName}`
      : intent.suggestedCommand;

    const message = `\u{1F914} Parece que você quer executar:\n\n\`${commandStr}\`\n\n_Digite o comando acima para confirmar ou use /help para ver outras opções._`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  /**
   * Truncate text to a maximum length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 3) + '...';
  }
}

// Export singleton instance
export const conversationHandler = new ConversationHandler();

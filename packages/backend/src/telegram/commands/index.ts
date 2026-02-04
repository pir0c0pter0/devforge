/**
 * Telegram Bot Commands Module
 *
 * Exports all command classes and utilities for the Telegram bot.
 * Commands are auto-registered when this module is imported.
 */

// Base command class
export { BaseCommand, type CommandCategory } from './base.command';

// Command registry
export {
  commandRegistry,
  registerCommand,
  type CommandInfo,
  type GroupedCommands,
} from './command.registry';

// Individual commands
export { helpCommand, startCommand, HelpCommand, StartCommand } from './help.command';
export { listCommand, ListCommand } from './list.command';
export { selectCommand, handleSelectCallback, SelectCommand } from './select.command';
export { statsCommand, StatsCommand } from './stats.command';
export { queueCommand, QueueCommand } from './queue.command';
export { execCommand, ExecCommand } from './exec.command';
export { clearCommand, ClearCommand } from './clear.command';
export { exitCommand, ExitCommand } from './exit.command';
export { modeCommand, ModeCommand } from './mode.command';
export { remindCommand, RemindCommand } from './remind.command';
export { tasksCommand, TasksCommand } from './tasks.command';

// Import commands to trigger registration
import { helpCommand, startCommand } from './help.command';
import { listCommand } from './list.command';
import { selectCommand } from './select.command';
import { statsCommand } from './stats.command';
import { queueCommand } from './queue.command';
import { execCommand } from './exec.command';
import { clearCommand } from './clear.command';
import { exitCommand } from './exit.command';
import { modeCommand } from './mode.command';
import { remindCommand } from './remind.command';
import { tasksCommand } from './tasks.command';
import { registerCommand } from './command.registry';

/**
 * Initialize and register all commands
 * Call this function during bot startup
 */
export function initializeCommands(): void {
  // Register general commands
  registerCommand(startCommand);
  registerCommand(helpCommand);
  registerCommand(clearCommand);
  registerCommand(exitCommand);
  registerCommand(modeCommand);
  registerCommand(remindCommand);
  registerCommand(tasksCommand);

  // Register container commands
  registerCommand(listCommand);
  registerCommand(selectCommand);
  registerCommand(statsCommand);

  // Register instruction commands
  registerCommand(queueCommand);
  registerCommand(execCommand);
}

/**
 * Get all command definitions for Telegram's command menu
 * Returns array suitable for bot.telegram.setMyCommands()
 */
export function getCommandMenuDefinitions(): Array<{
  command: string;
  description: string;
}> {
  return [
    { command: 'start', description: 'Mensagem de boas-vindas' },
    { command: 'help', description: 'Lista todos os comandos' },
    { command: 'clear', description: 'Limpar historico da conversa' },
    { command: 'exit', description: 'Sair do modo container' },
    { command: 'mode', description: 'Ver ou trocar modo' },
    { command: 'remind', description: 'Agendar um lembrete' },
    { command: 'tasks', description: 'Listar lembretes pendentes' },
    { command: 'list', description: 'Lista containers' },
    { command: 'select', description: 'Seleciona um container' },
    { command: 'stats', description: 'Estatisticas do container' },
    { command: 'queue', description: 'Status da fila de instrucoes' },
    { command: 'exec', description: 'Enviar instrucao ao Claude' },
  ];
}

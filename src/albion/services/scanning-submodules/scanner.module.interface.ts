import { Message } from 'discord.js';

export interface ScannerModuleInterface {
  scan(
    message: Message,
    dryRun: boolean
  ): Promise<void>;
}

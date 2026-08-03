import { Inject, Injectable, Logger } from '@nestjs/common';
import { Client } from 'discord.js';
import { NECORD_MODULE_OPTIONS, NecordModuleOptions, Once } from 'necord';

@Injectable()
export class GlobalCommandCleanupService {
  private readonly logger = new Logger(GlobalCommandCleanupService.name);

  constructor(
    private readonly discordClient: Client,
    @Inject(NECORD_MODULE_OPTIONS) private readonly necordOptions: NecordModuleOptions,
  ) {}

  // necord skips the global command scope entirely when every command is guild-scoped, so a
  // global registration left by an older deploy survives forever and shows up as a duplicate.
  @Once('clientReady')
  async onClientReady(): Promise<void> {
    if (!this.isGuildScoped()) {
      return;
    }

    try {
      const globalCommands = await this.discordClient.application.commands.fetch({});

      if (globalCommands.size === 0) {
        return;
      }

      const names = globalCommands.map((command) => command.name).join(', ');
      await this.discordClient.application.commands.set([]);

      this.logger.warn(`Removed ${globalCommands.size} stale global command(s): ${names}. Discord can take up to an hour to stop offering them.`);
    }
    catch (err) {
      this.logger.error(`Failed to clear stale global commands, so duplicate commands may still be visible! Err: ${err.message}`, err);
    }
  }

  // Only safe while necord is stamping every command with a guild; without it necord owns the
  // global scope and wiping it would delete commands it had just registered.
  private isGuildScoped(): boolean {
    const development = this.necordOptions.development;

    return Array.isArray(development) && development.length > 0;
  }
}

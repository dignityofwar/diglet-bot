import { Injectable, Logger } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import {
  Events,
  VoiceState,
} from 'discord.js';
import { DatabaseService } from '../../database/services/database.service';

@Injectable()
export class VoiceStateEvents {
  private readonly logger = new Logger(VoiceStateEvents.name);

  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  @On(Events.VoiceStateUpdate)
  async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {

    // Don't care about bots
    if (newState.member.user.bot) return;

    // Don't care about states changing in the same channel e.g. mute, deafen etc.
    // Channel IDs may not be present, depending on connect (oldState) or disconnect (newState)
    if (oldState.channel?.id === newState.channel?.id) return;

    this.logger.log(`Voice state updated for user: ${newState.member.displayName}`);

    await this.databaseService.updateActivity(newState.member);
  }
}

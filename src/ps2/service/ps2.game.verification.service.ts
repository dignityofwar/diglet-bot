import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { CensusWebsocketService } from './census.websocket.service';
import { ConfigService } from '@nestjs/config';
import { Channel, Client, GuildMember, Message, TextChannel } from 'discord.js';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { EventBusService } from './event.bus.service';
import { Death } from 'ps2census';
import { EventConstants } from '../constants/EventConstants';

// This service exists to subscribe to the PS2 Census websocket service and listen for particular events concerning characters.
// An long promise will be created, waiting for the character to do the actions performed.
// The character is verified by:
// 1. Logging into the game (if they aren't already)
// 2. Killing themselves with a frag grenade within 5 minutes of logging on
@Injectable()
export class PS2GameVerificationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PS2GameVerificationService.name);
  private verificationChannel: Channel;
  private monitoringCharacters: Map<string, CensusCharacterWithOutfitInterface> = new Map();
  private deadline = 1000 * 60 * 5; // 5 minutes
  private timer: NodeJS.Timeout;
  private messagesMap: Map<string, Message> = new Map();

  constructor(
    @InjectDiscordClient() private readonly discordClient: Client,
    private readonly config: ConfigService,
    private readonly censusWebsocketService: CensusWebsocketService,
    private readonly eventBus: EventBusService
  ) {}
  async onApplicationBootstrap() {
    // Store the Discord guild channel and ensure we can send messages to it
    const verifyChannelId = this.config.get('discord.channels.ps2Verify');

    this.verificationChannel = await this.discordClient.channels.fetch(verifyChannelId);
    if (!this.verificationChannel) {
      throw new Error(`Could not find channel with ID ${verifyChannelId}`);
    }
    if (!this.verificationChannel.isTextBased()) {
      throw new Error(`Channel with ID ${verifyChannelId} is not a text channel`);
    }

    this.eventBus.on(EventConstants.PS2_CENSUS_DEATH, (character) => this.handleVerification(character));
    this.eventBus.on(EventConstants.PS2_CENSUS_SUBSCRIBED, () => this.handleSubscription());
    this.eventBus.emit(EventConstants.PS2_VERIFICATION_SERVICE_READY);
  }

  public async watch(character: CensusCharacterWithOutfitInterface, guildMember: GuildMember) {
    // Add context to the character for easier retrieval later
    character.monitoringStarted = new Date();
    character.discordId = guildMember.id;
    this.monitoringCharacters.set(character.character_id, character);
    this.logger.debug(`Added character ${character.name.first} to watch list`);

    const message = await this.sendMessage(`Verification status: ⏳Setting up watcher for ${character.name.first} for verification...`);

    // Tell the websocket service to start monitoring the character for deaths
    this.censusWebsocketService.watchCharacter(character);

    message.edit(`Verification status: ⏳ Waiting for character "${character.name.first}" to suicide via a **VS Plasma Grenade**...`);
    message.react('👀');

    // Store the message reference for later so we can edit the message and also reply to it etc.
    this.messagesMap.set(character.character_id, message);

    return true;
  }

  private async unwatch(character: CensusCharacterWithOutfitInterface) {
    this.monitoringCharacters.delete(character.character_id);
    this.censusWebsocketService.unwatchCharacter(character);
  }

  private async sendMessage(message: string): Promise<Message<true>> {
    if (!this.verificationChannel.isTextBased()) {
      throw new Error(`Channel with ID ${this.verificationChannel.id} is not a text channel`);
    }
    return await (this.verificationChannel as TextChannel).send(message);
  }

  private async handleSubscription() {
    this.logger.log('Confirmed ESS stream is online and ready for events');
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      this.checkMonitoredCharacters();
    }, 1000 * 15);
  }

  private async handleVerification(deathEvent: Death) {
    this.logger.debug('Handling verification');
    const character = this.monitoringCharacters.get(deathEvent.character_id);

    const message = this.messagesMap.get(character.character_id);

    if (!character) {
      this.logger.error(`Could not find character with ID ${deathEvent.character_id}`);
      this.handleFailedVerification(character, `Could not find character. Pinging bot dev: <@${this.config.get('discord.devUserId')}> DEBUG: \`${deathEvent.character_id}\` from Death Event not found amongst monitored characters!`);
    }

    // Validate the death event was the same player suiciding with a VS frag grenade.
    const isSuicide = deathEvent.attacker_character_id === deathEvent.character_id;

    if (!isSuicide) {
      message.edit(`ℹ️ Death for character "${character.name.first}" detected, but it wasn't a suicide. You must kill your character with a **VS Plasma Grenade**. No other weapons or means of suicide will be accepted, it is this specific for a reason.`);
      return;
    }

    const isPlasmaGrenade = deathEvent.attacker_weapon_id === '44705';

    if (!isPlasmaGrenade) {
      message.edit(`ℹ️ Suicide for "${character.name.first}" detected, but it wasn't by using a **VS Plasma Grenade**. No other weapons or means of suicide will be accepted, it is this specific for a reason.`);
      return;
    }

    this.logger.log(`Death event for ${character.name.first} validated!`);
    this.handleSuccessfulVerification(character);
  }

  private handleFailedVerification(character: CensusCharacterWithOutfitInterface, failureReason: string) {
    this.logger.debug('Handling failed verification');
    const message = this.messagesMap.get(character.character_id);

    message.edit(`Verification status: ❌Character ${character.name.first} could not be verified! Reason: ${failureReason} ❌`);
    message.react('❌');

    message.channel.send(`<@${character.discordId}> your in game character "${character.name.first}" could not be verified! Please try again or contact the PS2 Leaders for assistance.`);
  }

  private handleSuccessfulVerification(character :CensusCharacterWithOutfitInterface) {
    this.logger.debug('Handling successful verification');
    const message = this.messagesMap.get(character.character_id);

    message.edit('Verification status: ✅!');
    message.react('✅');

    message.channel.send(`<@${character.discordId}> your in game character "${character.name.first}" has been successfully verified! Welcome to the [DIG] outfit! 🎉`);

    this.unwatch(character);
  }

  private checkMonitoredCharacters() {
    // Loop through the currently monitored characters and emit fail events for any that didn't perform the action in time

    const now = new Date();
    this.monitoringCharacters.forEach((character) => {
      const deadline = new Date(character.monitoringStarted.getTime() + this.deadline);

      if (now > deadline) {
        this.logger.error(`Timing out ${character.name.first}'s verification!`);
        this.unwatch(character);

        // Emit a fail event for the character
        this.handleFailedVerification(character, 'Verification timed out! You need to perform this action within 5 minutes. Please try again.');
        return;
      }

      const timeRemaining = Math.floor((deadline.getTime() - now.getTime()) / 1000);

      this.logger.debug(`${character.name.first} still pending verification (${timeRemaining} seconds remaining)`);

      // Emit an event detailing the time remaining for the character
    });
  }
}

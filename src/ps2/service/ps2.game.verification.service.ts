import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CensusWebsocketService } from './census.websocket.service';
import { ConfigService } from '@nestjs/config';
import { Channel, Client, GuildMember, Message, TextChannel } from 'discord.js';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { EventBusService } from './event.bus.service';
import { Death } from 'ps2census';
import { EventConstants } from '../constants/EventConstants';
import { PS2VerificationAttemptEntity } from '../../database/entities/ps2.verification.attempt.entity';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { PS2MembersEntity } from '../../database/entities/ps2.members.entity';

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
  private guildMembersMap: Map<string, GuildMember> = new Map();
  private deadline = 1000 * 60 * 5; // 5 minutes
  private timer: NodeJS.Timeout;
  private messagesMap: Map<string, Message> = new Map();
  private timeMessagesMap: Map<string, Message> = new Map();

  constructor(
    @InjectDiscordClient() private readonly discordClient: Client,
    private readonly config: ConfigService,
    private readonly censusWebsocketService: CensusWebsocketService,
    private readonly eventBus: EventBusService,
    @InjectRepository(PS2VerificationAttemptEntity) private readonly ps2VerificationAttemptRepository: EntityRepository<PS2VerificationAttemptEntity>,
    @InjectRepository(PS2MembersEntity) private readonly ps2MembersRepository: EntityRepository<PS2MembersEntity>
  ) {
  }

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

    await this.init();

    this.eventBus.on(EventConstants.PS2_CENSUS_DEATH, (character) => this.handleVerification(character));
    this.eventBus.on(EventConstants.PS2_CENSUS_SUBSCRIBED, () => this.handleSubscription());
    this.eventBus.emit(EventConstants.PS2_VERIFICATION_SERVICE_READY);
  }

  public async isValidRegistrationAttempt(character: CensusCharacterWithOutfitInterface, member: GuildMember): Promise<string | true> {
    this.logger.debug('Checking if registration attempt is valid');

    const ps2Member = await this.ps2MembersRepository.find({ characterId: character.character_id });
    if (ps2Member.length > 0) {
      // Get the original Discord user
      const originalDiscordMember = await member.guild.members.fetch(ps2Member[0].discordId);
      return `Character **"${character.name.first}"** has already been registered by user \`@${originalDiscordMember.displayName}\`. If you believe this to be in error, please contact the PS2 Leaders.`;
    }

    const ps2VerificationAttempt = await this.ps2VerificationAttemptRepository.find({ characterId: character.character_id });
    if (ps2VerificationAttempt.length > 0) {
      return `Character **"${character.name.first}"** already has a pending registration. Please complete it before attempting again. Pinging <@${this.config.get('discord.devUserId')}> in case there's a problem.`;
    }

    return true;
  }

  public async watch(character: CensusCharacterWithOutfitInterface, guildMember: GuildMember) {
    // Add context to the character for easier retrieval later
    character.monitoringStarted = new Date();
    const deadline = new Date(character.monitoringStarted.getTime() + this.deadline);
    this.monitoringCharacters.set(character.character_id, character);
    this.logger.debug(`Added character ${character.name.first} to watch list`);

    const message = await this.sendMessage(`Verification status: ⏳Setting up watcher for ${character.name.first} for verification...`);
    const timeMessage = await this.sendMessage(`Time remaining: ⏳**${this.calculateTimeRemaining(deadline)}**`);

    // Tell the websocket service to start monitoring the character for deaths
    this.censusWebsocketService.watchCharacter(character);

    await this.editMessage(`## Verification status: ⏳__Pending__\n\n⏳Please type **/suicide** in the in-game chat for character "${character.name.first}". Note this does not work in the warpgates or in the Sanctuary.`, message);

    // Store the messages to reference for later so we can edit the message and also reply to it etc.
    this.messagesMap.set(character.character_id, message);
    this.timeMessagesMap.set(character.character_id, timeMessage);

    // Store the GuildMember so we can ping them later
    this.guildMembersMap.set(character.character_id, guildMember);

    // Save the attempt to the DB so we can load it up should the bot be rebooted
    const verificationAttemptEntity = this.ps2VerificationAttemptRepository.create(
      { characterId: character.character_id, guildMember, guildMessage: message.id }
    );
    await this.ps2VerificationAttemptRepository.persistAndFlush(verificationAttemptEntity);

    return true;
  }

  private async unwatch(character: CensusCharacterWithOutfitInterface) {
    const timeMessage = this.timeMessagesMap.get(character.character_id);
    await this.deleteMessage(timeMessage);

    this.monitoringCharacters.delete(character.character_id);
    this.messagesMap.delete(character.character_id);
    this.timeMessagesMap.delete(character.character_id);
    this.censusWebsocketService.unwatchCharacter(character);
  }

  private async init() {
    // Flush any pending verification attempts that were in progress
    const verificationAttempts = await this.ps2VerificationAttemptRepository.findAll();
    for (const verificationAttempt of verificationAttempts) {
      await this.ps2VerificationAttemptRepository.removeAndFlush(verificationAttempt);
    }

    if (verificationAttempts.length > 0) {
      await (this.verificationChannel as TextChannel).send(`🤖 Removed ${verificationAttempts.length} pending verification attempts. Any previous attempts must be restarted.`);
    }

    return;
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
    }, 1000 * 5);
  }

  private async handleVerification(deathEvent: Death) {
    this.logger.debug('Handling verification');
    const character = this.monitoringCharacters.get(deathEvent.character_id);
    const message = this.messagesMap.get(character.character_id);
    const guildMember = this.guildMembersMap.get(character.character_id);

    if (!character) {
      this.logger.error(`Could not find character with ID ${deathEvent.character_id}`);
      await this.handleFailedVerification(character, `Could not find character. Pinging bot dev: <@${this.config.get('discord.devUserId')}> DEBUG: \`${deathEvent.character_id}\` from Death Event not found amongst monitored characters!`, guildMember);
    }

    // Validate the death event was the same player suiciding with a VS frag grenade.
    const isSuicide = deathEvent.attacker_character_id === deathEvent.character_id;

    if (!isSuicide) {
      await this.editMessage(`## Verification status: ⏳__Pending__\n\n⚠️ Death for character "${character.name.first}" detected, but it wasn't a suicide. Type **/suicide** in the game chat for the quickest way to do this.`, message);
      return;
    }

    this.logger.log(`Death event for ${character.name.first} validated!`);
    await this.handleSuccessfulVerification(character);
  }

  private async handleFailedVerification(character: CensusCharacterWithOutfitInterface, failureReason: string, guildMember: GuildMember, isError = false, unwatch = true) {
    this.logger.debug('Handling failed verification');
    const message = this.messagesMap.get(character.character_id);
    message.channel.sendTyping();
    await this.editMessage(`## Verification status: ❌ __FAILED__\n\nReason: ${failureReason}`, message);

    if (isError) {
      message.channel.send(failureReason);
    }

    if (unwatch) {
      await this.unwatch(character);

      try {
        const entity = await this.ps2VerificationAttemptRepository.find({ characterId: character.character_id });
        await this.ps2VerificationAttemptRepository.removeAndFlush(entity);
      }
      catch (err) {
        // Fucked
        message.channel.send(`Failed to remove the verification attempt from the database. Pinging <@${this.config.get('discord.devUserId')}>!`);
        return;
      }
    }

    message.channel.send(`<@${guildMember.id}> your in game character "${character.name.first}" could not be verified! Please read the reason as to why above. Feel free to contact the PS2 Leaders for assistance.`);
  }

  private async handleSuccessfulVerification(character: CensusCharacterWithOutfitInterface) {
    this.logger.debug('Handling successful verification');
    const message = this.messagesMap.get(character.character_id);
    await message.channel.sendTyping();
    const guildMember = this.guildMembersMap.get(character.character_id);

    // Edit their nickname to match their ingame
    try {
      await guildMember?.setNickname(character.name.first);
    }
    catch (err) {
      return await this.handleFailedVerification(character, `Unable to set your nickname. If you're an admin this won't work as the bot has no power over you! Pinging <@${this.config.get('discord.devUserId')}>!`, guildMember, true);
    }

    // Find the PS2/Verified role, it may have changed since the bot started
    const verifiedRoleId = this.config.get('discord.roles.ps2Verified');
    const verifiedRole = await message.guild.roles.fetch(verifiedRoleId);

    if (!verifiedRole) {
      return await this.handleFailedVerification(character, `Unable to find the PS2/Verified role! Pinging <@${this.config.get('discord.devUserId')}>!`, guildMember, true);
    }

    // Add the PS2/verified role to the Discord user
    try {
      await guildMember?.roles.add(verifiedRole);
    }
    catch (err) {
      return await this.handleFailedVerification(character, `Unable to add the PS2/Verified role to user! Pinging <@${this.config.get('discord.devUserId')}>!`, guildMember, true);
    }

    try {
      // Commit the successful verification attempt to the database so others can't claim the same character
      const ps2MemberEntity = this.ps2MembersRepository.create({
        discordId: guildMember.id,
        characterId: character.character_id,
        characterName: character.name.first,
      });
      await this.ps2MembersRepository.upsert(ps2MemberEntity);
    }
    catch (err) {
      const errorMessage = `Failed to save PS2 member to the database! ${err.message}`;
      this.logger.error(`Failed to save PS2 member to the database! ${err.message}`);
      await this.handleFailedVerification(character, `${errorMessage} Pinging <@${this.config.get('discord.devUserId')}>! Error: ${err.message}`, guildMember, true);
    }

    try {
      const entity = await this.ps2VerificationAttemptRepository.find({ characterId: character.character_id });
      await this.ps2VerificationAttemptRepository.removeAndFlush(entity);
    }
    catch (err) {
      const errorMessage = `Failed to delete PS2 member verification attempt from the database! ${err.message}`;
      this.logger.error(errorMessage);
      await this.handleFailedVerification(character, `${errorMessage} Pinging <@${this.config.get('discord.devUserId')}>! Error: ${err.message}`, guildMember, true);
    }

    await this.editMessage('## Verification status: ✅ __Successful__', message);

    await this.unwatch(character);
    message.channel.send(`<@${guildMember.id}> your in game character "${character.name.first}" has been successfully verified! Welcome to the [DIG] outfit! 🎉 \nYou can now see our private section <#${this.config.get('discord.channels.ps2Private')}>.\nInfo on how to be promoted to Zealot to use our Armory assets, visit <#${this.config.get('discord.channels.ps2HowToRankUp')}>.`);
  }

  private checkMonitoredCharacters() {
    // Loop through the currently monitored characters and emit fail events for any that didn't perform the action in time

    const now = new Date();
    this.monitoringCharacters.forEach(async (character) => {
      const deadline = new Date(character.monitoringStarted.getTime() + this.deadline);
      const difference = deadline.getTime() - now.getTime();
      const guildMember = this.guildMembersMap.get(character.character_id);
      const timeMessage = this.timeMessagesMap.get(character.character_id);

      if (difference < 0) {
        this.logger.error(`Timing out ${character.name.first}'s verification!`);

        // Emit a fail event for the character
        await this.handleFailedVerification(character, 'Verification timed out! You need to perform this action within the deadline.', guildMember);
        return;
      }
      const timeRemaining = this.calculateTimeRemaining(deadline);
      if (timeMessage) {await this.editMessage(`Time remaining: ⏳ **${timeRemaining}**`, timeMessage);}
      this.logger.debug(`${character.name.first} still pending verification (${timeRemaining} remaining)`);
    });
  }

  private async editMessage(content: string, message: Message) {
    // Check if the message is still there
    if (message) {
      return await message.edit(content);
    }

    this.logger.error('Message was not found!');
    return;
  }

  private async deleteMessage(message: Message) {
    if (message) {
      return await message.delete();
    }

    this.logger.error('Message was not found!');
    return;
  }

  private calculateTimeRemaining(deadline: Date) {
    const now = new Date();
    const difference = deadline.getTime() - now.getTime();
    const minutes = Math.floor(difference / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    return `${minutes} minutes ${seconds} seconds`;
  }
}

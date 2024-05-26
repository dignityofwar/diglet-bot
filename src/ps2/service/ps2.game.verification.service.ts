import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CensusWebsocketService } from './census.websocket.service';
import { ConfigService } from '@nestjs/config';
import { Channel, GuildMember, Message, TextChannel } from 'discord.js';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { EventBusService } from './event.bus.service';
import { Death } from 'ps2census';
import { EventConstants } from '../constants/EventConstants';
import { PS2VerificationAttemptEntity } from '../../database/entities/ps2.verification.attempt.entity';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { PS2MembersEntity } from '../../database/entities/ps2.members.entity';
import { DiscordService } from '../../discord/discord.service';

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
    private readonly discordService: DiscordService,
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

    this.verificationChannel = await this.discordService.getChannel(verifyChannelId);
    if (!this.verificationChannel) {
      throw new Error(`Could not find channel with ID ${verifyChannelId}`);
    }
    if (!this.verificationChannel.isTextBased()) {
      throw new Error(`Channel with ID ${verifyChannelId} is not a text channel`);
    }

    // We purposefully don't check if the verified role exists, as the bot could technically belong to multiple servers, and we'd have to start injecting the guild ID into the config service, which is a bit of a pain.

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

      if (!originalDiscordMember) {
        return `Character **"${character.name.first}"** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the PS2 Leaders.`;
      }

      return `Character **"${character.name.first}"** has already been registered by user \`@${originalDiscordMember.displayName}\`. If you believe this to be in error, please contact the PS2 Leaders.`;
    }

    const discordMember = await this.ps2MembersRepository.find({ discordId: member.id });
    if (discordMember.length > 0) {
      return 'You have already registered a character. We don\'t allow multiple characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or you have registered the wrong character, please contact the PS2 Leaders.';
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

    // Store the GuildMember so we can ping them later
    this.guildMembersMap.set(character.character_id, guildMember);

    // Save the attempt to the DB, so we can load it up should the bot be rebooted
    const verificationAttemptEntity = this.ps2VerificationAttemptRepository.create(
      {
        characterId: character.character_id,
        characterName: character.name.first,
      }
    );
    await this.ps2VerificationAttemptRepository.persistAndFlush(verificationAttemptEntity);

    // Force the message to wait so the reply is sent first and messages are rendered in the proper order
    setTimeout(async () => {
      const message = await this.sendMessage(`Verification status for \`${character.name.first}\`: ⏳Setting up watcher for ${character.name.first} for verification...`);
      const timeMessage = await this.sendMessage(`⏳ Time remaining for \`${character.name.first}\`: **${this.calculateTimeRemaining(deadline)}**`);

      // Tell the websocket service to start monitoring the character for deaths
      this.censusWebsocketService.watchCharacter(character);

      await this.editMessage(`Greetings ${guildMember.nickname || guildMember.displayName}! Your character \`${character.name.first}\` has been detected in [DIG]. However, to ensure the character belongs to you, you now need follow the below steps:
        \n1. Redeploy.
        \n2. At the top of the redeploy screen, click on the continent name (e.g. Sanctuary).
        \n3. Click on World Map.
        \n4. Go to VR Training.
        \n5. Wait a few seconds, then type **/suicide** in the in-game chat window.
        \nYour death won't be counted in your player's statistics.
        \nYou can also perform this on any continent, as long as it's not in Sanctuary, any Warpgate or Flotilla (on Oshur), but it will count towards your deaths outside of VR.
        \n## Verification status for \`${character.name.first}\`: ⏳__Pending__`, message);

      // Store the messages to reference for later so we can edit the message and also reply to it etc.
      this.messagesMap.set(character.character_id, message);
      this.timeMessagesMap.set(character.character_id, timeMessage);
    }, 2000);

    return true;
  }

  public async forceAdd(
    character: CensusCharacterWithOutfitInterface,
    targetMember: GuildMember,
    createdByMember: GuildMember
  ) {
    await this.applyDiscordChanges(character, targetMember);

    const entity = this.ps2MembersRepository.create({
      discordId: targetMember.id,
      characterId: character.character_id,
      characterName: character.name.first,
      manual: true,
      manualCreatedByDiscordId: createdByMember.id,
      manualCreatedByDiscordName: createdByMember.nickname || createdByMember.displayName,
    });

    await this.ps2MembersRepository.upsert(entity);

    await this.sendMessage(`🎉 <@${targetMember.id}> your in game character **${character.name.first}** has been manually verified by <@${createdByMember.id}>! Welcome to the [DIG] outfit!
🔓 You can now see our private section <#${this.config.get('discord.channels.ps2Private')}>. Should you leave the outfit, you will automatically lose this access.
ℹ️ For info on how to be promoted to Zealot to use our Armory assets, please visit <#${this.config.get('discord.channels.ps2HowToRankUp')}>.
️📝 Please note your Discord server nickname (not your username) has been automatically changed to match your character's name. You are free to change it again, but please ensure it is still a resemblance of your character name.
===================`);

    return true;
  }

  public async forceRemove(
    character: CensusCharacterWithOutfitInterface,
    targetMember: GuildMember,
    createdByMember: GuildMember
  ) {
    await this.applyDiscordChanges(character, targetMember, true);

    const entity = await this.ps2MembersRepository.findOne({ discordId: targetMember.id });

    if (!entity || !entity.id) {
      await this.sendMessage(`ERROR: Could not find members record for Discord ID ${targetMember.id}! Pinging <@${this.config.get('discord.devUserId')}>!`);
      return 'ERROR';
    }

    await this.ps2MembersRepository.removeAndFlush(entity);

    await this.sendMessage(`🗑️ <@${targetMember.id}> your verification status has been manually removed by <@${createdByMember.id}>! You will need to re-verify yourself should you wish to regain full membership.
===================`);

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

    for (const verificationAttempt of verificationAttempts) {
      await (this.verificationChannel as TextChannel).send(`🗑️ Removed verification attempt for \`${verificationAttempt.characterName}\``);
    }

    if (verificationAttempts.length > 0) {
      await (this.verificationChannel as TextChannel).send(`⚠️ Removed ${verificationAttempts.length} pending verification attempt(s) due to bot restart or crash. Any previous attempts must be restarted. Pinging <@${this.config.get('discord.devUserId')}>.`);
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
    this.logger.debug('Handling PS2 verification');
    const character = this.monitoringCharacters.get(deathEvent.character_id) ?? null;

    if (!character?.character_id) {
      this.logger.warn(`Received message somehow not related to monitored characters! ${deathEvent.character_id}`);
      return;
    }

    const message = this.messagesMap.get(character.character_id) ?? null;

    // Validate the death event was the same player suiciding with a VS frag grenade.
    const isSuicide = deathEvent.attacker_character_id === deathEvent.character_id;

    if (!isSuicide) {
      await this.editMessage(`## Verification status for \`${character.name.first}\`: ⏳__Pending__\n\n⚠️ Death for character "${character.name.first}" detected, but it wasn't a suicide. Type **/suicide** in the game chat in VR Training for the quickest way to do this.`, message);
      return;
    }

    this.logger.log(`Death event for ${character.name.first} validated!`);
    await this.handleSuccessfulVerification(character);
  }

  private async handleFailedVerification(character: CensusCharacterWithOutfitInterface, failureReason: string, guildMember?: GuildMember | null, isError = false, unwatch = true) {
    this.logger.debug('Handling failed verification');

    const message = this.messagesMap.get(character.character_id) ?? null;

    // Fucked
    if (!message) {
      throw new Error('Message vanished, cannot proceed.');
    }

    await message.channel.sendTyping();
    await this.editMessage(`## Verification status for \`${character.name.first}\`: ❌ __FAILED__\n\nReason: ${failureReason}`, message);

    if (isError) {
      await message.channel.send(failureReason);
    }

    if (unwatch) {
      await this.unwatch(character);

      try {
        const entity = await this.ps2VerificationAttemptRepository.find({ characterId: character.character_id });
        await this.ps2VerificationAttemptRepository.removeAndFlush(entity);
      }
      catch (err) {
        // Fucked
        await message.channel.send(`Failed to remove the verification attempt from the database. Pinging <@${this.config.get('discord.devUserId')}>!`);
        return;
      }
    }

    if (guildMember) {
      await message.channel.send(`😔 <@${guildMember.id}> your in game character "${character.name.first}" could not be verified! Please read the reason as to why above. Feel free to contact the PS2 Leaders for assistance.`);
    }
  }

  private async handleSuccessfulVerification(character: CensusCharacterWithOutfitInterface) {
    this.logger.debug('Handling successful verification');
    const message = this.messagesMap.get(character.character_id) ?? null;

    // Fucked
    if (!message) {
      throw new Error('Message vanished, cannot proceed');
    }

    await message.channel.sendTyping();
    const guildMember = this.guildMembersMap.get(character.character_id);

    await this.applyDiscordChanges(character, guildMember);

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
      const errorMessage = 'Failed to save PS2 member to the database!';
      this.logger.error(`Failed to save PS2 member to the database! ${err.message}`);
      return await this.handleFailedVerification(character, `${errorMessage} Pinging <@${this.config.get('discord.devUserId')}>! Error: ${err.message}`, guildMember, true);
    }

    try {
      const entity = await this.ps2VerificationAttemptRepository.find({ characterId: character.character_id });
      await this.ps2VerificationAttemptRepository.removeAndFlush(entity);
    }
    catch (err) {
      const errorMessage = 'Failed to delete PS2 member verification attempt from the database!';
      this.logger.error(errorMessage);
      return await this.handleFailedVerification(character, `${errorMessage} Pinging <@${this.config.get('discord.devUserId')}>! Error: ${err.message}`, guildMember, true);
    }

    await this.editMessage(`## Verification status for \`${character.name.first}\`: ✅ __Successful__!`, message);

    await this.unwatch(character);
    await message.channel.send(`### 🎉 <@${guildMember.id}> your in game character **${character.name.first}** has been successfully verified! Welcome to the [DIG] outfit!
🔓 You can now see our private section <#${this.config.get('discord.channels.ps2Private')}>. Should you leave the outfit, you will automatically lose this access.
ℹ️ For info on how to be promoted to Zealot to use our Armory assets, please visit <#${this.config.get('discord.channels.ps2HowToRankUp')}>.
️📝 Please note your Discord server nickname (not your username) has been automatically changed to match your character's name. You are free to change it again, but please ensure it is still a resemblance of your character name.
===================`);

    this.logger.log(`Successfully verified ${character.name.first}!`);
  }

  private async applyDiscordChanges(character: CensusCharacterWithOutfitInterface, guildMember: GuildMember, remove = false) {
    // Add the PS2/verified role to the Discord user
    const verifiedRoleId = this.config.get('discord.roles.ps2Verified');
    const verifyRole = await this.discordService.getMemberRole(guildMember, verifiedRoleId);

    if (!verifyRole) {
      throw new Error(`Could not find role with ID ${verifiedRoleId}`);
    }

    try {
      if (remove) {
        await guildMember?.roles.remove(verifyRole);
      }
      else {
        await guildMember?.roles.add(verifyRole);
      }
    }
    catch (err) {
      return await this.handleFailedVerification(character, `Unable to add/remove the PS2/Verified role to user! Pinging <@${this.config.get('discord.devUserId')}>!`, guildMember, true);
    }

    // Edit their nickname to match their ingame
    try {
      if (!remove) {
        await guildMember?.setNickname(character.name.first);
      }
    }
    catch (err) {
      await this.sendMessage(`Unable to set nickname for user \`${guildMember.nickname || guildMember.displayName}\`. If you're an admin or staff this won't work as the bot has no power over you! Pinging <@${this.config.get('discord.devUserId')}>!`);
    }
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
      if (timeMessage) {
        await this.editMessage(`⏳ Time remaining for \`${character.name.first}\`:  **${timeRemaining}**`, timeMessage);
      }
      this.logger.debug(`${character.name.first} still pending verification (${timeRemaining} remaining)`);
    });
  }

  private async editMessage(content: string, message: Message) {
    // Check if the message is still there
    if (message) {
      try {
        return await message.edit(content);
      }
      catch (err) {
        this.logger.error(`Failed to edit message! ${err.message}`);
        await message.channel.send(`Failed to edit message! Content would have been:
        \n${content}
        \nPinging<@${this.config.get('discord.devUserId')}>`);
      }
    }

    this.logger.error('Message was not found!');
    return;
  }

  private async deleteMessage(message: Message) {
    if (message) {
      try {
        return await message.delete();
      }
      catch (err) {
        this.logger.error(`Failed to delete message! ${err.message}`);
        await message.channel.send(`Failed to delete message! Error received: "${err.message}"
        \nMessage details:
        \n ${JSON.stringify(message)}
        \n Pinging <@${this.config.get('discord.devUserId')}>`);
      }
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

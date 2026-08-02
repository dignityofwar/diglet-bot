import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, MessageFlags } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { AlbionApiService } from './albion.api.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import {
  AlbionRegistrationQueueEntity,
  AlbionRegistrationQueueStatus,
} from '../../database/entities/albion.registration.queue.entity';
import { ALBION_GUILD_EMOJI, AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';
import { AlbionRoleMapInterface } from '../../config/albion.app.config';

// The rank a force-registered member starts on, same as anyone joining the guild fresh.
export const ALBION_FORCE_REGISTER_RANK = '@ALB/Disciple';

export interface ForceRegistrationResult {
  characterName: string
  characterId: string
  discordMember: GuildMember
  queueResolved: boolean
  queueError?: string
}

@Injectable()
export class AlbionForceRegistrationService {
  private readonly logger = new Logger(AlbionForceRegistrationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    private readonly albionApiService: AlbionApiService,
    @InjectRepository(AlbionRegistrationsEntity)
    private readonly albionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
    @InjectRepository(AlbionRegistrationQueueEntity)
    private readonly albionRegistrationQueueRepository: EntityRepository<AlbionRegistrationQueueEntity>,
  ) {}

  // Registers a character without ever asking whether it is in the guild. The character itself is
  // still looked up, because the stored character ID is what the daily scan reads back.
  async forceRegister(
    characterName: string,
    discordMemberId: string,
    discordGuildId: string,
    performedBy: GuildMember,
  ): Promise<ForceRegistrationResult> {
    const guildId = this.config.get('albion.guildId');

    const discordMember = await this.getDiscordMember(discordGuildId, discordMemberId);
    const character = await this.getCharacter(characterName);

    // Resolved before anything is written, so a broken role map can't leave a half-done registration.
    const roleIds = this.getRegistrationRoleIds();

    await this.checkNotAlreadyRegistered(guildId, character, discordMember);

    // The database row is the authoritative record, so it goes in first and is rolled back if the
    // member never actually receives the roles.
    await this.createRegistration(guildId, character, discordMember, performedBy);

    try {
      await this.applyRoles(discordMember, roleIds);
    }
    catch (err) {
      await this.rollbackRegistration(guildId, discordMember.id);
      throw err;
    }

    await this.setNickname(discordMember, character.Name);

    const queue = await this.resolveQueuedAttempt(guildId, discordMember.id);

    this.logger.log(
      `Force registered "${character.Name}" (${character.Id}) to Discord ID ${discordMember.id} by ${performedBy.id}`,
    );

    await this.announce(character.Name, discordMember, performedBy);

    return {
      characterName: character.Name,
      characterId: character.Id,
      discordMember,
      queueResolved: queue.resolved,
      queueError: queue.error,
    };
  }

  private async getDiscordMember(discordGuildId: string, discordMemberId: string): Promise<GuildMember> {
    try {
      return await this.discordService.getGuildMember(discordGuildId, discordMemberId);
    }
    catch (err) {
      this.throwError(`Discord member <@${discordMemberId}> could not be found on the server. Err: ${err.message}`);
    }
  }

  private async getCharacter(characterName: string): Promise<AlbionPlayerInterface> {
    try {
      return await this.albionApiService.getCharacter(characterName);
    }
    catch (err) {
      this.throwError(`Could not look up character **${characterName}**. Err: ${err.message}`);
    }
  }

  private async checkNotAlreadyRegistered(
    guildId: string,
    character: AlbionPlayerInterface,
    discordMember: GuildMember,
  ): Promise<void> {
    const foundByDiscord = await this.albionRegistrationsRepository.findOne({
      guildId,
      discordId: String(discordMember.id),
    });

    if (foundByDiscord) {
      this.throwError(
        `<@${discordMember.id}> is already registered as **${foundByDiscord.characterName}**. Deregister them first if this needs changing.`,
      );
    }

    const foundByCharacter = await this.albionRegistrationsRepository.findOne({
      guildId,
      characterId: character.Id,
    });

    if (foundByCharacter) {
      this.throwError(
        `Character **${character.Name}** is already registered to <@${foundByCharacter.discordId}>.`,
      );
    }
  }

  private getRegistrationRoleIds(): string[] {
    return [
      this.config.get('discord.roles.albionMember'),
      this.config.get('discord.roles.albionRegistered'),
      this.config.get('discord.roles.albionAnnouncements'),
      this.getRankRoleId(ALBION_FORCE_REGISTER_RANK),
    ];
  }

  private async applyRoles(discordMember: GuildMember, roleIds: string[]): Promise<void> {
    try {
      for (const roleId of roleIds) {
        await discordMember.roles.add(
          await this.discordService.getRoleViaMember(discordMember, roleId),
        );
      }
    }
    catch (err) {
      this.throwError(
        `Unable to add roles to "${discordMember.displayName}"! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`,
      );
    }
  }

  private getRankRoleId(rankName: string): string {
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');
    const role = roleMap.find((entry) => entry.name === rankName);

    if (!role) {
      this.throwError(
        `Rank \`${rankName}\` is missing from the Albion role map! Pinging <@${this.config.get('discord.devUserId')}>!`,
      );
    }

    return role.discordRoleId;
  }

  private async createRegistration(
    guildId: string,
    character: AlbionPlayerInterface,
    discordMember: GuildMember,
    performedBy: GuildMember,
  ): Promise<void> {
    try {
      const entity = this.albionRegistrationsRepository.create({
        discordId: discordMember.id,
        characterId: character.Id,
        characterName: character.Name,
        guildId,
        manual: true,
        manualCreatedByDiscordId: performedBy.id,
        manualCreatedByDiscordName: performedBy.nickname || performedBy.displayName,
      });
      // A plain insert, not an upsert: both unique keys must reject a clash outright rather than
      // silently reassign whichever existing row they hit.
      await this.albionRegistrationsRepository.getEntityManager().persist(entity).flush();
    }
    catch (err) {
      this.throwError(
        `Unable to add the registration to the database! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`,
      );
    }
  }

  private async rollbackRegistration(guildId: string, discordMemberId: string): Promise<void> {
    try {
      await this.albionRegistrationsRepository.nativeDelete({
        guildId,
        discordId: String(discordMemberId),
      });
    }
    catch (err) {
      this.logger.error(`Failed to roll back the registration for ${discordMemberId}: ${err.message}`);
    }
  }

  private async setNickname(discordMember: GuildMember, characterName: string): Promise<void> {
    try {
      await discordMember.setNickname(characterName);
    }
    catch (err) {
      // Staff outrank the bot, so this fails routinely and must not undo the registration.
      this.logger.warn(`Unable to set nickname for "${discordMember.displayName}": ${err.message}`);
    }
  }

  // Anything still queued for this member is now moot, so close it out rather than let the retry
  // cron keep hammering a character that is already registered. Runs after the registration is
  // committed, so a failure here is reported but never fails the command.
  private async resolveQueuedAttempt(
    guildId: string,
    discordMemberId: string,
  ): Promise<{ resolved: boolean, error?: string }> {
    const existing = await this.albionRegistrationQueueRepository.findOne({
      guildId,
      discordId: String(discordMemberId),
      status: AlbionRegistrationQueueStatus.PENDING,
    });

    if (!existing) {
      return { resolved: false };
    }

    try {
      // Only one row per guild/member/status may exist, so an earlier succeeded attempt has to go
      // before this one can take that status.
      await this.albionRegistrationQueueRepository.nativeDelete({
        guildId,
        discordId: String(discordMemberId),
        status: AlbionRegistrationQueueStatus.SUCCEEDED,
      });

      existing.status = AlbionRegistrationQueueStatus.SUCCEEDED;
      existing.lastError = null;

      // v7 no longer change-tracks scalar properties automatically, so persist explicitly.
      await this.albionRegistrationQueueRepository.getEntityManager().persist(existing).flush();

      return { resolved: true };
    }
    catch (err) {
      this.logger.error(`Failed to close out the queued attempt for ${discordMemberId}: ${err.message}`);
      return { resolved: false, error: err.message };
    }
  }

  private async announce(
    characterName: string,
    discordMember: GuildMember,
    performedBy: GuildMember,
  ): Promise<void> {
    const registrationChannelId = this.config.get('discord.channels.albionRegistration');
    const rolesChannel = this.config.get('discord.channels.albionRoles');
    const announcementChannel = this.config.get('discord.channels.albionAnnouncements');
    const pingRoles = this.config.get('albion.pingLeaderRoles');

    const content = `# ✅ <@${discordMember.id}>, your character **${characterName}** has been registered! 🎉

Leadership have manually registered you to the ${ALBION_GUILD_EMOJI} Dignity Of War guild, so you did not need to be detected by our data source.

## 👉️👉️👉️️ NEXT STEP: <#${rolesChannel}>
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${announcementChannel}> announcements channel. If you wish to opt out, go to <#${rolesChannel}>, double tap the 🔔 icon.

Force registered by <@${performedBy.id}>. CC <@&${pingRoles.join('>, <@&')}>`;

    try {
      const channel = await this.discordService.getTextChannel(registrationChannelId);
      await channel.send({
        content,
        flags: MessageFlags.SuppressEmbeds,
        // Staff-run command, so be explicit that the member really does get pinged.
        allowedMentions: { users: [discordMember.id], roles: pingRoles },
      });
    }
    catch (err) {
      this.logger.error(`Failed to announce force registration: ${err.message}`);
    }
  }

  private throwError(error: string): never {
    this.logger.error(error);
    throw new Error(error);
  }
}

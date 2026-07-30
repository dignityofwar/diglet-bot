import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import {
  AlbionRegistrationQueueEntity,
  AlbionRegistrationQueueStatus,
} from '../../database/entities/albion.registration.queue.entity';

// Matches the expiry the normal registration flow applies when it queues an attempt.
export const ALBION_REGISTRATION_QUEUE_TTL_HOURS = 72;

export interface ForceQueueResult {
  characterName: string
  discordMember: GuildMember
  expiresAt: Date
  requeued: boolean
}

@Injectable()
export class AlbionRegistrationQueueService {
  private readonly logger = new Logger(AlbionRegistrationQueueService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    @InjectRepository(AlbionRegistrationsEntity)
    private readonly albionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
    @InjectRepository(AlbionRegistrationQueueEntity)
    private readonly albionRegistrationQueueRepository: EntityRepository<AlbionRegistrationQueueEntity>,
  ) {}

  // Queues a registration attempt without asking the Albion API anything. The normal flow looks the
  // character up first, which fails outright for characters the API hasn't published yet.
  async forceQueue(
    characterName: string,
    discordMemberId: string,
    discordGuildId: string,
  ): Promise<ForceQueueResult> {
    const guildId = this.config.get('albion.guildId');
    const registrationChannelId = String(this.config.get('discord.channels.albionRegistration'));

    const discordMember = await this.getDiscordMember(discordGuildId, discordMemberId);

    await this.checkNotAlreadyRegistered(guildId, characterName, discordMember);
    await this.checkCharacterNotQueuedByAnotherMember(guildId, characterName, discordMemberId);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ALBION_REGISTRATION_QUEUE_TTL_HOURS);

    // Only one row per guild/member/status exists, so an outstanding attempt must be updated in place.
    const existing = await this.albionRegistrationQueueRepository.findOne({
      guildId,
      discordId: String(discordMemberId),
      status: AlbionRegistrationQueueStatus.PENDING,
    });

    if (existing) {
      existing.characterName = characterName;
      existing.discordGuildId = discordGuildId;
      existing.discordChannelId = registrationChannelId;
      existing.attemptCount = 0;
      existing.expiresAt = expiresAt;
      existing.lastError = 'Force queued by staff.';

      // v7 no longer change-tracks scalar properties automatically, so persist explicitly.
      await this.albionRegistrationQueueRepository.getEntityManager().persist(existing).flush();

      this.logger.log(`Force re-queued Albion registration for "${characterName}" (Discord ID ${discordMemberId})`);

      return { characterName, discordMember, expiresAt, requeued: true };
    }

    // Clear out any previous failure so the member isn't left with a stale record alongside the new one.
    await this.albionRegistrationQueueRepository.nativeDelete({
      guildId,
      discordId: String(discordMemberId),
      discordGuildId,
      status: AlbionRegistrationQueueStatus.FAILED,
    });

    const entity = this.albionRegistrationQueueRepository.create({
      guildId,
      discordGuildId,
      discordChannelId: registrationChannelId,
      discordId: String(discordMemberId),
      characterName,
      attemptCount: 0,
      expiresAt,
      status: AlbionRegistrationQueueStatus.PENDING,
      lastError: 'Force queued by staff.',
    });
    await this.albionRegistrationQueueRepository.upsert(entity);

    this.logger.log(`Force queued Albion registration for "${characterName}" (Discord ID ${discordMemberId})`);

    return { characterName, discordMember, expiresAt, requeued: false };
  }

  private async getDiscordMember(discordGuildId: string, discordMemberId: string): Promise<GuildMember> {
    try {
      return await this.discordService.getGuildMember(discordGuildId, discordMemberId);
    }
    catch (err) {
      this.throwError(`Discord member <@${discordMemberId}> could not be found on the server. Err: ${err.message}`);
    }
  }

  private async checkNotAlreadyRegistered(
    guildId: string,
    characterName: string,
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
      characterName,
    });

    if (foundByCharacter) {
      this.throwError(
        `Character **${characterName}** is already registered to <@${foundByCharacter.discordId}>.`,
      );
    }
  }

  private async checkCharacterNotQueuedByAnotherMember(
    guildId: string,
    characterName: string,
    discordMemberId: string,
  ): Promise<void> {
    const existing = await this.albionRegistrationQueueRepository.findOne({
      guildId,
      characterName,
      status: AlbionRegistrationQueueStatus.PENDING,
    });

    if (existing && String(existing.discordId) !== String(discordMemberId)) {
      this.throwError(
        `Character **${characterName}** is already queued for <@${existing.discordId}>. Resolve that attempt first.`,
      );
    }
  }

  private throwError(error: string): never {
    this.logger.error(error);
    throw new Error(error);
  }
}

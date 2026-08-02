import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Context, ContextOf, On } from 'necord';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember } from 'discord.js';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionRoleMapInterface } from '../../config/albion.app.config';
import { DiscordService } from '../../discord/discord.service';

type RankColumn = 'graduateSince' | 'adeptSince';

const TRACKED_RANKS: Array<{ column: RankColumn, roleName: string }> = [
  { column: 'graduateSince', roleName: '@ALB/Graduate' },
  { column: 'adeptSince', roleName: '@ALB/Adept' },
];

@Injectable()
export class AlbionRankProgressService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionRankProgressService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    @InjectRepository(AlbionRegistrationsEntity) private readonly registrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seedExistingRanks();
    }
    catch (err) {
      // Seeding is best effort - a failure here must not stop the bot booting
      this.logger.error(`Failed to seed existing Albion rank dates: ${err.message}`);
    }
  }

  private findRole(name: string): AlbionRoleMapInterface | undefined {
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');
    return roleMap.find((role) => role.name === name);
  }

  @On('guildMemberUpdate')
  async onGuildMemberUpdate(
    @Context() [oldMember, newMember]: ContextOf<'guildMemberUpdate'>,
  ): Promise<void> {
    try {
      if (newMember.user.bot) {
        return;
      }

      const changes = TRACKED_RANKS.map(({ column, roleName }) => {
        const role = this.findRole(roleName);

        if (!role) {
          return null;
        }

        const had = oldMember.roles.cache.has(role.discordRoleId);
        const has = newMember.roles.cache.has(role.discordRoleId);

        if (had === has) {
          return null;
        }

        return { column, roleName, gained: has };
      }).filter(Boolean);

      if (changes.length === 0) {
        return;
      }

      const registration = await this.registrationsRepository.findOne({
        guildId: this.config.get('albion.guildId'),
        discordId: newMember.id,
      });

      // Nothing to stamp against - they'll be seeded if they register later
      if (!registration) {
        return;
      }

      let changed = false;

      for (const { column, roleName, gained } of changes) {
        // Losing the rank clears its date, so a later re-promotion starts the clock again
        // rather than counting from the first time they held it.
        if (!gained) {
          if (!registration[column]) {
            continue;
          }

          registration[column] = null;
          changed = true;
          this.logger.log(`Cleared ${column} for ${newMember.displayName} on losing ${roleName}`);
          continue;
        }

        // Only ever fill a null, so a role removed and re-added within one event doesn't
        // overwrite a date that is still valid
        if (registration[column]) {
          continue;
        }

        registration[column] = new Date();
        changed = true;
        this.logger.log(`Stamped ${column} for ${newMember.displayName} on gaining ${roleName}`);
      }

      if (!changed) {
        return;
      }

      await this.registrationsRepository.getEntityManager().persist(registration).flush();
    }
    catch (err) {
      this.logger.error(`Error handling guild member update for rank progress: ${err.message}`);
    }
  }

  // Fills rank dates for members who already held the rank when this feature shipped.
  // Only ever writes nulls, so it is idempotent and safe on every boot.
  async seedExistingRanks(): Promise<void> {
    const guildId = this.config.get('albion.guildId');
    const graduateRole = this.findRole('@ALB/Graduate');
    const adeptRole = this.findRole('@ALB/Adept');

    if (!graduateRole || !adeptRole) {
      throw new Error('Could not resolve the Graduate or Adept role from the Albion role map');
    }

    const registrations = await this.registrationsRepository.find({ guildId });

    if (registrations.length === 0) {
      return;
    }

    const members = await this.fetchMembers(registrations.map((registration) => registration.discordId));
    const now = new Date();
    let seeded = 0;

    for (const registration of registrations) {
      const member = members.get(registration.discordId);

      if (!member) {
        continue;
      }

      const isAdept = member.roles.cache.has(adeptRole.discordRoleId);
      const isGraduate = member.roles.cache.has(graduateRole.discordRoleId);

      if (isAdept && !registration.adeptSince) {
        registration.adeptSince = now;
        seeded++;
      }

      // An Adept was necessarily a Graduate first - Disciple to Adept isn't a legal path -
      // so leaving graduateSince null would misreport their history.
      if ((isGraduate || isAdept) && !registration.graduateSince) {
        registration.graduateSince = now;
        seeded++;
      }
    }

    if (seeded === 0) {
      return;
    }

    await this.registrationsRepository.getEntityManager().persist(registrations).flush();
    this.logger.log(`Seeded ${seeded} Albion rank date(s) for existing members`);
  }

  private async fetchMembers(discordIds: string[]): Promise<Map<string, GuildMember>> {
    const guild = await this.discordService.getGuild(this.config.get('discord.guildId'));
    const members = new Map<string, GuildMember>();

    await guild.members.fetch();

    for (const discordId of discordIds) {
      const member = guild.members.cache.get(discordId);

      if (member) {
        members.set(discordId, member);
      }
    }

    return members;
  }
}

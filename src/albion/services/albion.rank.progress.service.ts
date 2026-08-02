import { Injectable, Logger } from '@nestjs/common';
import { Context, ContextOf, On } from 'necord';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionRoleMapInterface } from '../../config/albion.app.config';

type RankColumn = 'graduateSince' | 'adeptSince';

const TRACKED_RANKS: Array<{ column: RankColumn, roleName: string }> = [
  { column: 'graduateSince', roleName: '@ALB/Graduate' },
  { column: 'adeptSince', roleName: '@ALB/Adept' },
];

@Injectable()
export class AlbionRankProgressService {
  private readonly logger = new Logger(AlbionRankProgressService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(AlbionRegistrationsEntity) private readonly registrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
  ) {}

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

        // Gaining the rank always stamps, overwriting whatever was there. Anything already set
        // on someone who did not hold the role is stale by definition - the migration stamps
        // every registration, including Disciples, so this is what gives them their real date
        // when they are actually promoted.
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
}


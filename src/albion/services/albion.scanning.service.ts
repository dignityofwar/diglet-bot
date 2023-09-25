import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, Message } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { RankMapInterface } from '../../config/app.config';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { AlbionApiService } from './albion.api.service';
import { AlbionPlayersResponseInterface } from '../interfaces/albion.api.interfaces';

interface ChangesInterface {
  character: AlbionPlayersResponseInterface,
  discordMember: GuildMember | null,
  change: string
}

@Injectable()
export class AlbionScanningService {
  private readonly logger = new Logger(AlbionScanningService.name);
  private charactersMap: Map<string, AlbionPlayersResponseInterface> = new Map();
  private changesMap: Map<string, ChangesInterface> = new Map();

  constructor(
    private readonly albionApiService: AlbionApiService,
    private readonly config: ConfigService,
    @InjectRepository(AlbionMembersEntity) private readonly albionMembersEntityRepository: EntityRepository<AlbionMembersEntity>
  ) {
  }

  reset() {
    this.logger.log('Resetting maps...');
    this.charactersMap.clear();
    this.changesMap.clear();
  }

  async gatherCharacters(guildMembers: AlbionMembersEntity[], statusMessage: Message, tries = 0): Promise<AlbionPlayersResponseInterface[]> {
    const characterPromises: Promise<AlbionPlayersResponseInterface>[] = [];
    tries++;
    const length = guildMembers.length;

    await statusMessage.edit(`Gathering ${length} characters from API... (attempt #${tries})`);

    for (const member of guildMembers) {
      characterPromises.push(this.albionApiService.getCharacterById(member.characterId));
    }

    try {
      return await Promise.all(characterPromises);
    }
    catch (err) {
      if (tries === 3) {
        await statusMessage.edit(`## ❌ An error occurred while gathering ${length} characters! Giving up after 3 tries.`);
        await statusMessage.channel.send(`Error: ${err.message}`);
        return null;
      }

      await statusMessage.edit(`## ⚠️ Couldn't gather ${length} characters from API, likely due to API timeout issues. Retrying in 10s (attempt #${tries})...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      return this.gatherCharacters(guildMembers, statusMessage, tries);
    }
  }

  async startScan(originalMessage: Message, dryRun = false) {
    const message = await originalMessage.edit('Starting scan...');

    // Pull the list of verified members from the database and check if they're still in the guild
    // If they're not, remove the verified role from them and any other Albion Roles
    // Also send a message to the #albion-scans channel to denote this has happened

    const guildMembers = await this.albionMembersEntityRepository.findAll();
    const length = guildMembers.length;

    let characters: Array<AlbionPlayersResponseInterface | null>;

    try {
      characters = await this.gatherCharacters(guildMembers, message);
    }
    catch (err) {
      return this.reset();
    }

    if (!characters) {
      await message.edit('## ❌ No characters were gathered from Albion API!');
      return this.reset();
    }

    try {
      await message.edit(`Checking ${length} characters for membership status...`);
      await this.removeLeavers(characters, guildMembers, message, dryRun);
    }
    catch (err) {
      await message.edit('## ❌ An error occurred while scanning!');
      await message.channel.send(`Error: ${err.message}`);
      return this.reset();
    }

    if (this.changesMap.size === 0) {
      await message.channel.send('✅ No automatic changes were performed.');
      this.logger.log('No changes were made.');
    }
    else {
      await message.channel.send(`## 📝 ${this.changesMap.size} change(s) made`);
      this.logger.log(`Sending ${this.changesMap.size} changes to channel...`);
    }

    for (const change of this.changesMap.values()) {
      const fakeMessage = await message.channel.send('dummy'); // Send a fake message first so it doesn't ping people
      await fakeMessage.edit(change.change);
    }

    if (this.changesMap.size > 0 && !dryRun) {
      const pingRoles = this.config.get('app.albion.pingRoles');
      await message.channel.send(`🔔 <@&${pingRoles.join('>, <@&')}> Please review the above changes and make any necessary changes manually within the guild. To check again without pinging Leaders and Officers, run the \`/albion-scan\` command with the \`dry-run\` flag set to \`true\`.`);
    }

    await message.edit(`ℹ️ There are currently ${guildMembers.length} members on record.`);

    return this.reset();
  }

  async removeLeavers(characters: AlbionPlayersResponseInterface[], guildMembers: AlbionMembersEntity[], message: Message, dryRun = false) {
    // Save all the characters to a map we can easily pick out later
    for (const character of characters) {
      this.charactersMap.set(character.data.Id, character);
    }

    // Do the checks
    for (const member of guildMembers) {
      const character = this.charactersMap.get(member.characterId);

      let discordMember: GuildMember | null = null;

      try {
        discordMember = await message.guild.members.fetch({ user: member.discordId, force: true });
      }
      catch (err) {
        // No discord member means they've left the server
        this.logger.log(`User ${character.data.Name} has left the server`);

        if (!dryRun) {
          await this.albionMembersEntityRepository.removeAndFlush(member);
        }

        this.changesMap.set(member.characterId, {
          character,
          discordMember: null,
          change: `- 🫥️ Discord member for Character **${character.data.Name}** has left the DIG server. Their verification status has been removed.`,
        });
        continue;
      }

      // Is the character still in the guild?
      if (character?.data.GuildId === this.config.get('app.albion.guildId')) {
        continue;
      }

      // If not in the guild, strip 'em
      this.logger.log(`User ${character.data.Name} has left the guild!`);

      const rankMaps: RankMapInterface = this.config.get('app.albion.rankMap');

      // Remove all private roles from the user
      for (const rankMap of Object.values(rankMaps)) {
        const role = message.guild.roles.cache.get(rankMap.discordRoleId);
        // Check if the user has the role to remove in the first place
        const hasRole = discordMember.roles.cache.has(rankMap.discordRoleId);

        if (!hasRole) {
          continue;
        }

        if (!dryRun) {
          try {
            await discordMember.roles.remove(rankMap.discordRoleId);
          }
          catch (err) {
            await message.channel.send(`ERROR: Unable to remove role "${role.name}" from ${character.data.Name} (${character.data.Id}). Pinging <@${this.config.get('app.discord.ownerId')}>!`);
          }
        }
      }

      if (!dryRun) {
        await this.albionMembersEntityRepository.removeAndFlush(member);
      }

      this.changesMap.set(member.characterId, {
        character,
        discordMember,
        change: `- 👋 <@${discordMember.id}>'s character **${character.data.Name}** has left the guild. Their initiate and squire roles have been automatically removed and verification status have been stripped.`,
      });
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { PS2MembersEntity } from '../../database/entities/ps2.members.entity';
import { EntityRepository } from '@mikro-orm/core';
import { CensusApiService } from './census.api.service';
import { GuildMember, Message } from 'discord.js';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { ConfigService } from '@nestjs/config';
import { RankMapInterface } from '../../config/ps2.app.config';

interface ChangesInterface {
  character: CensusCharacterWithOutfitInterface,
  discordMember: GuildMember | null,
  change: string
}

@Injectable()
export class PS2GameScanningService {
  private readonly logger = new Logger(PS2GameScanningService.name);
  private charactersMap: Map<string, CensusCharacterWithOutfitInterface> = new Map();
  private changesMap: Map<string, ChangesInterface> = new Map();
  private suggestionsMap: Map<string, ChangesInterface[]> = new Map();
  private suggestionsCount = 0;

  constructor(
    private readonly censusService: CensusApiService,
    private readonly config: ConfigService,
    @InjectRepository(PS2MembersEntity) private readonly ps2MembersRepository: EntityRepository<PS2MembersEntity>
  ) {
  }

  reset() {
    this.logger.log('Resetting maps...');
    this.charactersMap.clear();
    this.changesMap.clear();
    this.suggestionsMap.clear();
    this.suggestionsCount = 0;
  }

  async gatherCharacters(outfitMembers, statusMessage: Message, tries = 0) {
    const characterPromises: Promise<CensusCharacterWithOutfitInterface>[] = [];
    tries++;
    const length = outfitMembers.length;

    await statusMessage.edit(`Gathering ${length} characters from Census... (attempt #${tries})`);

    for (const member of outfitMembers) {
      characterPromises.push(this.censusService.getCharacterById(member.characterId));
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

      await statusMessage.edit(`## ⚠️ Couldn't gather ${length} characters from Census, likely due to Census timeout issues. Retrying in 10s (attempt #${tries})...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      return this.gatherCharacters(outfitMembers, statusMessage, tries);
    }
  }

  async startScan(originalMessage: Message, dryRun = false) {
    const message = await originalMessage.edit('Starting scan...');

    // Pull the list of verified members from the database and check if they're still in the outfit
    // If they're not, remove the verified role from them and any other PS2 Roles
    // Also send a message to the #ps2-scans channel to denote this has happened

    const outfitMembers = await this.ps2MembersRepository.findAll();
    const length = outfitMembers.length;

    let characters: Array<CensusCharacterWithOutfitInterface | null>;

    try {
      characters = await this.gatherCharacters(outfitMembers, message);
    }
    catch (err) {
      return this.reset();
    }

    if (!characters) {
      await message.edit('## ❌ No characters were gathered from Census!');
      return this.reset();
    }

    try {
      await message.edit(`Checking ${length} characters for membership status...`);
      await this.removeLeavers(characters, outfitMembers, message, dryRun);

      await message.edit(`Checking ${length} characters for role inconsistencies...`);
      await this.checkForSuggestions(characters, outfitMembers, message);
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

    if (this.suggestionsMap.size === 0) {
      await message.channel.send('✅ There are currently no inconsistencies between ranks and roles.');
      this.logger.log('No suggestions were made.');
    }
    else {
      await message.channel.send(`## 👀 ${this.suggestionsCount} manual correction(s) to make`);
      this.logger.log(`Sending ${this.suggestionsCount} suggestions to channel...`);
    }

    for (const change of this.suggestionsMap.values()) {
      for (const suggestion of change) {
        const fakeMessage = await message.channel.send('dummy'); // Send a fake message first so it doesn't ping people
        await fakeMessage.edit(suggestion.change);
      }
    }

    if (this.suggestionsCount > 0 && !dryRun) {
      const pingRoles = this.config.get('ps2.pingRoles');
      await message.channel.send(`🔔 <@&${pingRoles.join('>, <@&')}> Please review the above suggestions and make any necessary changes manually. To check again without pinging Leaders and Officers, run the \`/ps2-scan\` command with the \`dry-run\` flag set to \`true\`.`);
    }

    await message.edit(`ℹ️ There are currently ${outfitMembers.length} members on record.`);

    return this.reset();
  }

  async removeLeavers(characters: CensusCharacterWithOutfitInterface[], outfitMembers: PS2MembersEntity[], message: Message, dryRun = false) {
    // Save all the characters to a map we can easily pick out later
    for (const character of characters) {
      this.charactersMap.set(character.character_id, character);
    }

    // Do the checks
    for (const member of outfitMembers) {
      const character = this.charactersMap.get(member.characterId);

      let discordMember: GuildMember | null = null;

      try {
        discordMember = await message.guild.members.fetch({ user: member.discordId, force: true });
      }
      catch (err) {
        // No discord member means they've left the server
        this.logger.log(`User ${character.name.first} has left the server`);

        if (!dryRun) {
          await this.ps2MembersRepository.removeAndFlush(member);
        }

        this.changesMap.set(member.characterId, {
          character,
          discordMember: null,
          change: `- 🫥️ Discord member for Character **${character.name.first}** has left the DIG server. Their verification status has been removed.`,
        });
        continue;
      }

      // Is the character still in the outfit?
      if (character?.outfit_info && character?.outfit_info.outfit_id === this.config.get('ps2.outfitId')) {
        continue;
      }

      // If not in the outfit, strip 'em
      this.logger.log(`User ${character.name.first} has left the outfit`);

      const rankMaps: RankMapInterface = this.config.get('ps2.rankMap');

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
            await message.channel.send(`ERROR: Unable to remove role "${role.name}" from ${character.name.first} (${character.character_id}). Pinging <@${this.config.get('app.discord.ownerId')}>!`);
          }
        }
      }

      if (!dryRun) {
        await this.ps2MembersRepository.removeAndFlush(member);
      }

      this.changesMap.set(member.characterId, {
        character,
        discordMember,
        change: `- 👋 <@${discordMember.id}>'s character **${character.name.first}** has left the outfit. Their roles and verification status have been stripped.`,
      });
    }
  }

  async checkForSuggestions(characters: CensusCharacterWithOutfitInterface[], outfitMembers: PS2MembersEntity[], message: Message) {
    // Check if there are any characters in the outfit that have invalid discord permissions

    const rankMap: RankMapInterface = this.config.get('ps2.rankMap');

    // Get the ranks from Census for the names
    const outfit = await this.censusService.getOutfit(this.config.get('ps2.outfitId'));

    for (const member of outfitMembers) {
      // If already in the change set, they have been removed so don't bother checking
      if (this.changesMap.has(member.characterId)) {
        continue;
      }

      const character = this.charactersMap.get(member.characterId);
      const discordMember = await message.guild.members.fetch({ user: member.discordId, force: true });

      // First get their rank
      const rank = character.outfit_info?.rank_ordinal;

      // Find the rank name
      const rankIngame = outfit.ranks.find((ps2Rank) => ps2Rank.ordinal === rank);

      // Line their rank up with the correct role(s)
      const shouldHaveRoles = Object.values(rankMap).filter((role) => {
        if (role.ranks) {
          return role.ranks.includes(rank);
        }
      });

      shouldHaveRoles.forEach((role) => {
        // Get the role from the guild
        const guildRole = message.guild.roles.cache.get(role.discordRoleId);

        // Now check if the user has the role
        const hasRole = discordMember.roles.cache.has(role.discordRoleId);

        if (!hasRole) {
          // Get all current suggestions, if any
          const suggestions = this.suggestionsMap.get(member.characterId) || [];
          suggestions.push({
            character,
            discordMember,
            change: `- 😳 <@${discordMember.id}> is missing their rightful role of \`${guildRole.name}\`, as they have "${rankIngame.name}" in-game!`,
          });
          this.suggestionsMap.set(member.characterId, suggestions);
          this.suggestionsCount++;
        }
      });

      // Now check if they have any roles they shouldn't have
      const shouldNotHaveRoles = Object.values(rankMap).filter((role) => {
        if (role.ranks) {
          return !role.ranks.includes(rank);
        }
      });

      shouldNotHaveRoles.forEach((role) => {
        // Get the role from the guild
        const guildRole = message.guild.roles.cache.get(role.discordRoleId);

        // Now check if the user has the role
        const hasRole = discordMember.roles.cache.has(role.discordRoleId);

        if (hasRole) {
          // Get all current suggestions, if any
          const suggestions = this.suggestionsMap.get(member.characterId) || [];

          suggestions.push({
            character,
            discordMember,
            change: `- 🤔 <@${discordMember.id}> has the role \`${guildRole.name}\` when their in-game rank of "${rankIngame.name}" suggests they shouldn't!`,
          });
          this.suggestionsMap.set(member.characterId, suggestions);
          this.suggestionsCount++;
        }
      });
    }
  }
}

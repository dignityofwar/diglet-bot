import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { PS2MembersEntity } from '../../database/entities/ps2.members.entity';
import { EntityRepository } from '@mikro-orm/core';
import { CensusApiService } from './census.api.service';
import { GuildMember, Message } from 'discord.js';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { ConfigService } from '@nestjs/config';
import { PS2RankMapInterface } from '../../config/ps2.app.config';

export interface ChangesInterface {
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

  async gatherCharacters(
    outfitMembers: PS2MembersEntity[],
    statusMessage: Message
  ): Promise<CensusCharacterWithOutfitInterface[]> {
    const characterPromises = [];
    const length = outfitMembers.length;

    await statusMessage.edit(`Gathering ${length} characters from Census...`);

    for (const member of outfitMembers) {
      characterPromises.push(async () => {
        try {
          return await this.censusService.getCharacterById(member.characterId);
        }
        catch (err) {
          // If an error was thrown, return null for the character. Report the error though to the channel.
          // The null is then filtered out at the promise.all stage.
          // Later, the validateMembership function will check if the character data is absent and skip it if it doesn't exist.
          await statusMessage.channel.send(`❌ ${err.message}`);
          return null;
        }
      });
    }

    // Get all the characters at the same time.
    const characters = await Promise.all(characterPromises.map(promiseFunc => promiseFunc()));

    // Filter out any null characters, as they errored during the process.
    // validateMembership will handle these cases.
    const validChars = characters.filter((character) => character !== null);

    // "Cache" the characters to a map for easier access later
    validChars.forEach((character) => {
      this.charactersMap.set(character.character_id, character);
    });

    return validChars;
  }

  // Main execution
  async startScan(message: Message, dryRun = false) {
    await message.edit('Starting scan...');

    // Pull the list of verified members from the database and check if they're still in the outfit
    // If they're not, remove the verified role from them and any other PS2 Roles
    // Also send a message to the #ps2-scans channel to denote this has happened

    let outfitMembers = await this.ps2MembersRepository.findAll();
    let length = outfitMembers.length;

    const characters: Array<CensusCharacterWithOutfitInterface | null> = await this.gatherCharacters(outfitMembers, message);

    if (characters.length === 0) {
      await message.edit('## ❌ No characters were gathered from Census!');
      return this.reset();
    }

    try {
      await message.edit(`Checking ${length} characters for membership status...`);
      await this.verifyMembership(characters, outfitMembers, message, dryRun);

      // Re-grab outfit members, as some may have been removed by verifyMembership
      outfitMembers = await this.ps2MembersRepository.findAll();
      length = outfitMembers.length;

      await message.edit(`Checking ${length} characters for role inconsistencies...`);
      await this.checkForSuggestions(outfitMembers, message);
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
      const fakeMessage = await message.channel.send('dummy'); // Send a fake message first, so it doesn't ping people
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
        const fakeMessage = await message.channel.send('dummy'); // Send a fake message first, so it doesn't ping people
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

  async verifyMembership(
    characters: CensusCharacterWithOutfitInterface[],
    ps2Members: PS2MembersEntity[],
    message: Message,
    dryRun = false
  ) {
    for (const member of ps2Members) {
      const character = characters.find((char) => char.character_id === member.characterId);
      let discordMember: GuildMember | null = null;

      // The character for some reason doesn't exist. This may be because of Census Server Errors, therefore we need to skip them this time.
      // This is to prevent a rather nasty bug / scenario where we remove literally everyone because Census is on its arse.
      // Dev needs to be notified though in case of repeated failures which may need manual rectification.
      // @ref #208
      if (!character) {
        const error = `Character data for **${member.characterName}** (${member.characterId}) did not exist when attempting to verify their membership. Skipping.`;
        this.logger.error(error);
        await message.channel.send(`❌ ${error} Pinging <@${this.config.get('discord.devUserId')}>!`);
        continue;
      }

      // If they've left the Discord, don't even bother checking their outfit status, we need to de-register them.
      try {
        discordMember = await message.guild.members.fetch({ user: member.discordId, force: true });
      }
      catch (err) {
        this.logger.log(`${dryRun ? '[DRY RUN] ' : ''}User ${character.name.first} has left the server!`);
        await this.removeDiscordLeaver(member, character, dryRun);
        continue;
      }

      // Remove them if they have no outfit at all or have left our outfit.
      if (
        !character.outfit_info || character.outfit_info?.outfit_id !== this.config.get('ps2.outfitId')
      ) {
        this.logger.log(`${dryRun ? '[DRY RUN] ' : ''}User ${member.characterId} has left the outfit, but remains on the server!`);
        await this.removeOutfitLeaver(member, character, discordMember, message, dryRun);
      }
    }

    // They remain in the outfit and Discord, so they are still valid.
  }

  async removeDiscordLeaver(
    member: PS2MembersEntity,
    character: CensusCharacterWithOutfitInterface,
    dryRun = false
  ): Promise<void> {
    if (!dryRun) {
      await this.ps2MembersRepository.getEntityManager().removeAndFlush(member);
    }

    this.changesMap.set(member.characterId, {
      character,
      discordMember: null,
      change: `- 🫥️ Discord member for Character **${character.name.first}** has left the DIG Discord server.`,
    });
  }

  async removeOutfitLeaver(
    member: PS2MembersEntity,
    character: CensusCharacterWithOutfitInterface,
    discordMember: GuildMember,
    message: Message,
    dryRun = false
  ): Promise<void> {
    // If a dry run, there is nothing else to do beyond reporting the "change".
    if (dryRun) {
      this.changesMap.set(member.characterId, {
        character,
        discordMember,
        change: `- 👋 <@${discordMember.id}>'s character **${character.name.first}** has left the outfit. Their roles and verification status have been stripped.`,
      });
      return;
    }

    // They remain on the Discord, so now they need their roles stripping.
    const rankMaps: PS2RankMapInterface = this.config.get('ps2.rankMap');

    // Remove all private roles from the user
    for (const rank of Object.values(rankMaps)) {
      const role = message.guild.roles.cache.get(rank.discordRoleId);
      // Check if the user has the role to remove in the first place
      const hasRole = discordMember.roles.cache.has(rank.discordRoleId);

      // If they don't have the role, skip
      if (!hasRole) {
        continue;
      }

      try {
        await discordMember.roles.remove(rank.discordRoleId);
      }
      catch (err) {
        await message.channel.send(`ERROR: Unable to remove role "${role.name}" from ${character.name.first} (${character.character_id}). Pinging <@${this.config.get('discord.devUserId')}>!`);
      }
    }

    await this.ps2MembersRepository.getEntityManager().removeAndFlush(member);

    this.changesMap.set(member.characterId, {
      character,
      discordMember,
      change: `- 👋 <@${discordMember.id}>'s character **${character.name.first}** has left the outfit. Their roles and verification status have been stripped.`,
    });
  }

  async checkForSuggestions(
    outfitMembers: PS2MembersEntity[],
    message: Message
  ) {
    // Check if there are any characters in the outfit that have invalid discord permissions

    const rankMap: PS2RankMapInterface = this.config.get('ps2.rankMap');

    // Get the ranks from Census for the names
    const outfit = await this.censusService.getOutfit(this.config.get('ps2.outfitId'));

    for (const member of outfitMembers) {
      this.logger.log(`Checking suggestions on ${member.characterName}...`);
      // If already in the change set, they have been removed so don't bother checking
      if (this.changesMap.has(member.characterId)) {
        continue;
      }

      const character = this.charactersMap.get(member.characterId);

      if (!character) {
        this.logger.error(`Character data for **${member.characterName}** (${member.characterId}) did not exist when attempting to check for suggestions. Skipping.`);
        continue;
      }

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

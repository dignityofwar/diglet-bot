import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { PS2MembersEntity } from '../../database/entities/ps2.members.entity';
import { EntityRepository } from '@mikro-orm/core';
import { CensusApiService } from './census.api.service';
import { ChatInputCommandInteraction, GuildMember, Message } from 'discord.js';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { ConfigService } from '@nestjs/config';
import { RankMapInterface } from '../../config/app.config';

interface ChangesInterface {
  character: CensusCharacterWithOutfitInterface,
  discordMember: GuildMember | null,
  change: string
}

@Injectable()
export class PS2GameScanningService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PS2GameScanningService.name);
  private messagesMap: Map<string, Message> = new Map();
  private charactersMap: Map<string, CensusCharacterWithOutfitInterface> = new Map();
  private changesMap: Map<string, ChangesInterface> = new Map();
  private suggestionsMap: Map<string, ChangesInterface> = new Map();

  constructor(
    private readonly censusService: CensusApiService,
    private readonly config: ConfigService,
    @InjectRepository(PS2MembersEntity) private readonly ps2MembersRepository: EntityRepository<PS2MembersEntity>
  ) {
  }
  async onApplicationBootstrap() {
    // ...
  }

  reset() {
    this.logger.log('Resetting maps...');
    this.messagesMap.clear();
    this.charactersMap.clear();
    this.changesMap.clear();
    this.suggestionsMap.clear();
  }

  async startScan(interaction: ChatInputCommandInteraction) {
    const message = await interaction.channel.send('Starting scan...');

    this.messagesMap.set(interaction.id, message);

    await this.scanForMembership(message);
  }

  async scanForMembership(message: Message) {
    // Pull the list of verified members from the database and check if they're still in the outfit
    // If they're not, remove the verified role from them and any other PS2 Roles
    // Also send a message to the #ps2-leadership channel to denote this has happened

    const outfitMembers = await this.ps2MembersRepository.findAll();
    const length = outfitMembers.length;

    const characterPromises: Promise<CensusCharacterWithOutfitInterface>[] = [];

    for (const member of outfitMembers) {
      characterPromises.push(this.censusService.getCharacterById(member.characterId));
    }

    await message.edit(`Gathering ${length} characters from Census...`);

    const characters: Array<CensusCharacterWithOutfitInterface | null> = await Promise.all(characterPromises);

    try {
      await message.edit(`Checking ${length} characters for membership status...`);
      await this.removeLeavers(characters, outfitMembers, message);

      // await message.edit(`Checking ${length} characters for role inconsistencies...`);
      // await this.checkForSuggestions(characters, outfitMembers, message);
    }
    catch (err) {
      console.log(err);
      await message.edit('## ❌ An error occurred while scanning!');
      await message.channel.send(`Error: ${err.message}`);
      return this.reset();
    }

    if (this.changesMap.size === 0) {
      await message.edit('No changes made.');
      this.logger.log('No changes were made.');
      return this.reset();
    }
    else {
      await message.edit(`There are currently ${outfitMembers.length} members on record. \n## 📝 ${this.changesMap.size} changes made`);
      this.logger.log(`Sending ${this.changesMap.size} changes to channel...`);
    }

    for (const change of this.changesMap.values()) {
      await message.channel.send(change.change);
    }

    if (this.suggestionsMap.size === 0) {
      await message.channel.send('✅ There are currently no inconsistencies between ranks and roles.');
      this.logger.log('No suggestions were made.');
    }
    else {
      await message.channel.send('## 👀 Suggestions of changes to make');
      this.logger.log(`Sending ${this.suggestionsMap.size} suggestions to channel...`);

    }

    for (const change of this.suggestionsMap.values()) {
      await message.channel.send(change.change);
    }

    return this.reset();
  }

  async removeLeavers(characters: CensusCharacterWithOutfitInterface[], outfitMembers: PS2MembersEntity[], message: Message) {
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
        // No discord memember means they've left the server
        this.logger.log(`User ${character.name.first} has left the server`);
        await this.ps2MembersRepository.removeAndFlush(member);
        this.changesMap.set(member.characterId, {
          character,
          discordMember: null,
          change: `🫥️ Discord member for Character **${character.name.first}** has left the DIG server. Their verification status has been removed.`,
        });
        continue;
      }

      // Is the character still in the outfit?
      if (character.outfit_info && character.outfit_info.outfit_id === this.config.get('app.ps2.outfitId')) {
        continue;
      }

      // If not in the outfit, strip 'em
      this.logger.log(`User ${character.name.first} has left the outfit`);

      const rankMaps: RankMapInterface = this.config.get('app.ps2.rankMap');

      // Remove all private roles from the user
      for (const rankMap of Object.values(rankMaps)) {
        const role = message.guild.roles.cache.get(rankMap.discordRoleId);
        // Check if the user has the role to remove in the first place
        const hasRole = discordMember.roles.cache.has(rankMap.discordRoleId);

        if (!hasRole) {
          console.log(`User ${discordMember.user.username} (${discordMember.user.id}) does not have role "${role.name} to remove.`);
          continue;
        }

        try {
          await discordMember.roles.remove(rankMap.discordRoleId);
        }
        catch (err) {
          await message.channel.send(`ERROR: Unable to remove role "${role.name}" from ${character.name.first} (${character.character_id}). Pinging <@${this.config.get('app.discord.ownerId')}>!`);
        }
      }

      await this.ps2MembersRepository.removeAndFlush(member);

      this.changesMap.set(member.characterId, {
        character,
        discordMember,
        change: `👋 <@${discordMember.id}>'s character **${character.name.first}** has left the outfit. Their roles and verification status have been stripped.`,
      });
    }
  }

  async checkForSuggestions(characters: CensusCharacterWithOutfitInterface[], outfitMembers: PS2MembersEntity[], message: Message) {
    console.log(this.changesMap);
    // Check if there are any characters in the outfit that have invalid discord permissions

    for (const member of outfitMembers) {
      // If already in the change set, they have been removed so don't bother checking
      if (this.changesMap.has(member.characterId)) {
        continue;
      }

      const character = this.charactersMap.get(member.characterId);
      const rankMap: RankMapInterface = this.config.get('app.ps2.rankMap');
      const currentRoles = await message.guild.members.fetch({ user: member.discordId, force: true });

      // Get a filtered list of roles that are in the rank map
      const filteredRoles = currentRoles.roles.cache.filter(role => Object.values(rankMap).some(rank => rank.discordRoleId === role.id));

      // If they don't have any roles according to the rank map, we can't check them anyway as we have no idea what to look for
      if (!filteredRoles.size) {
        continue;
      }

      // Loop the now filtered roles and check if they have the correct role for their rank
      for (const role of filteredRoles.values()) {
        const rankRole = Object.values(rankMap).find(rank => rank.discordRoleId === role.id);

        // If the role is correct, continue
        if (rankRole.rank === character.outfit_info.rank_ordinal) {
          continue;
        }

        // If the role is incorrect, add it to the suggestions map
        this.suggestionsMap.set(member.characterId, {
          character,
          discordMember: currentRoles,
          change: `❓ ${character.name.first} (${character.character_id}) has incorrect role "${role.name}"`,
        });
      }
    }
  }
}

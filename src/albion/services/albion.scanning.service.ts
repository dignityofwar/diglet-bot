import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { PS2MembersEntity } from '../../database/entities/ps2.members.entity';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, Message, Role } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { PS2RankMapInterface } from '../../config/ps2.app.config';
import { AlbionApiService } from './albion.api.service';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';
import { AlbionRoleMapInterface } from '../../config/albion.app.config';

interface ChangesInterface {
  character: AlbionPlayerInterface,
  discordMember: GuildMember | null,
  change: string
}

export interface RoleInconsistencyResult {
  id: string,
  name: string,
  action: 'add' | 'remove'
}

@Injectable()
export class AlbionScanningService {
  private readonly logger = new Logger(AlbionScanningService.name);
  private charactersMap: Map<string, AlbionPlayerInterface> = new Map();
  private changesMap: Map<string, ChangesInterface> = new Map();
  private suggestionsMap: Map<string, ChangesInterface[]> = new Map();
  private suggestionsCount = 0;

  constructor(
    private readonly albionApiService: AlbionApiService,
    private readonly config: ConfigService,
    @InjectRepository(AlbionMembersEntity) private readonly albionMembersRepository: EntityRepository<AlbionMembersEntity>
  ) {
  }

  reset() {
    this.logger.log('Resetting maps...');
    this.charactersMap.clear();
    this.changesMap.clear();
    this.suggestionsMap.clear();
    this.suggestionsCount = 0;
  }

  async startScan(message: Message, dryRun = false) {
    await message.edit('Starting scan...');

    // Pull the list of verified members from the database and check if they're still in the outfit
    // If they're not, remove the verified role from them and any other PS2 Roles
    // Also send a message to the #ps2-scans channel to denote this has happened

    const guildMembers: AlbionMembersEntity[] = await this.albionMembersRepository.findAll();
    const length = guildMembers.length;

    let characters: Array<AlbionPlayerInterface | null>;

    try {
      characters = await this.gatherCharacters(guildMembers, message);
    }
    catch (err) {
      return this.reset();
    }

    if (!characters) {
      await message.edit('## ❌ No characters were gathered from the API!');
      return this.reset();
    }

    try {
      await message.edit(`Checking ${length} characters for membership status...`);
      await this.removeLeavers(characters, guildMembers, message, dryRun);

      await message.edit(`Checking ${length} characters for role inconsistencies...`);
      await this.checkForSuggestions(guildMembers, message);
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

    await message.edit(`ℹ️ There are currently ${guildMembers.length} members on record.`);

    return this.reset();
  }

  async gatherCharacters(guildMembers: AlbionMembersEntity[], statusMessage: Message, tries = 0) {
    const characterPromises: Promise<AlbionPlayerInterface>[] = [];
    tries++;
    const length = guildMembers.length;

    await statusMessage.edit(`Gathering ${length} characters from Census... (attempt #${tries})`);

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

      await statusMessage.edit(`## ⚠️ Couldn't gather ${length} characters from Census, likely due to Census timeout issues. Retrying in 10s (attempt #${tries})...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      return this.gatherCharacters(guildMembers, statusMessage, tries);
    }
  }

  async removeLeavers(characters: AlbionPlayerInterface[], guildMembers: AlbionMembersEntity[], message: Message, dryRun = false) {
    // Save all the characters to a map we can easily pick out later
    for (const character of characters) {
      this.charactersMap.set(character.Id, character);
    }

    // Do the checks
    for (const member of guildMembers) {
      const character = this.charactersMap.get(member.characterId);

      let discordMember: GuildMember | null = null;

      try {
        discordMember = await message.guild.members.fetch({ user: member.discordId, force: true });
      }
      catch (err) {
        // No discord member means they've left the server. Remove them from the database and continue.
        this.logger.log(`User ${character.Name} has left the server`);

        if (!dryRun) {
          await this.albionMembersRepository.removeAndFlush(member);
        }

        this.changesMap.set(member.characterId, {
          character,
          discordMember: null,
          change: `- 🫥️ Discord member for Character **${character.Name}** has left the DIG server. Their registration status has been removed.`,
        });
        continue;
      }

      // Is the character still in the Guild?
      if (character?.GuildId && character?.GuildId === this.config.get('albion.guildGameId')) {
        continue;
      }

      // If not in the outfit, strip 'em
      this.logger.log(`User ${character.Name} has left the Guild`);

      const roleMaps: AlbionRoleMapInterface = this.config.get('albion.roleMap');

      // Remove all roles from the user
      for (const roleMap of Object.values(roleMaps)) {
        const role = message.guild.roles.cache.get(roleMap.discordRoleId);
        // Check if the user has the role to remove in the first place
        const hasRole = discordMember.roles.cache.has(roleMap.discordRoleId);

        if (!hasRole) {
          continue;
        }

        if (!dryRun) {
          try {
            await discordMember.roles.remove(roleMap.discordRoleId);
          }
          catch (err) {
            await message.channel.send(`ERROR: Unable to remove role "${role.name}" from ${character.Name} (${character.Id}). Pinging <@${this.config.get('app.discord.ownerId')}>!`);
          }
        }
      }

      if (!dryRun) {
        await this.albionMembersRepository.removeAndFlush(member);
      }

      this.changesMap.set(member.characterId, {
        character,
        discordMember,
        change: `- 👋 <@${discordMember.id}>'s character **${character.Name}** has left the outfit. Their roles and verification status have been stripped.`,
      });
    }
  }

  async checkRoleInconsistencies(discordMember: GuildMember): Promise<RoleInconsistencyResult[]> {
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');

    let highestPriorityRole: AlbionRoleMapInterface | null = null;
    const result: RoleInconsistencyResult[] = [];

    roleMap.forEach((role) => {
      const hasRole = discordMember.roles.cache.has(role.discordRoleId);

      if (!hasRole) return;

      if (!highestPriorityRole || role.priority < highestPriorityRole.priority) {
        highestPriorityRole = role;
      }
    });

    if (!highestPriorityRole) return result; // return object with empty arrays if no highest priority role is found

    roleMap.forEach((role) => {
      const shouldHaveRole = role.priority === highestPriorityRole!.priority || (role.priority > highestPriorityRole!.priority && role.keep);
      const hasRole = discordMember.roles.cache.has(role.discordRoleId);

      if (shouldHaveRole && !hasRole) {
        result.push({
          id: role.discordRoleId,
          name: role.name,
          action: 'add' }
        );
      }
      if (!shouldHaveRole && hasRole && !role.keep) {
        result.push({
          id: role.discordRoleId,
          name: role.name,
          action: 'remove' }
        );
      }
    });

    return result;
  }

  async checkForSuggestions(
    guildMembers: AlbionMembersEntity[],
    message: Message
  ) {
    for (const member of guildMembers) {
      // If already in the change set, they have been removed so don't bother checking
      if (this.changesMap.has(member.characterId)) {
        continue;
      }

      const character = this.charactersMap.get(member.characterId);
      const discordMember = await message.guild.members.fetch({ user: member.discordId, force: true });

      const inconsistencies = await this.checkRoleInconsistencies(discordMember);

    }
  }
}

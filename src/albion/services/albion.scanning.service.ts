import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, Message, Role } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { AlbionApiService } from './albion.api.service';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';
import { AlbionRoleMapInterface } from '../../config/albion.app.config';
import { AlbionUtilities } from '../utilities/albion.utilities';

export interface RoleInconsistencyResult {
  id: string,
  name: string,
  action: 'added' | 'removed', // For testing purposes
  message: string
}

@Injectable()
export class AlbionScanningService {
  private readonly logger = new Logger(AlbionScanningService.name);

  constructor(
    private readonly albionApiService: AlbionApiService,
    private readonly config: ConfigService,
    private readonly albionUtilities: AlbionUtilities,
    @InjectRepository(AlbionMembersEntity) private readonly albionMembersRepository: EntityRepository<AlbionMembersEntity>
  ) {
  }

  async startScan(message: Message, dryRun = false) {
    await message.edit('## Starting scan...');

    // Pull the list of verified members from the database and check if they're still in the outfit
    // If they're not, remove the verified role from them and any other PS2 Roles
    // Also send a message to the #ps2-scans channel to denote this has happened

    const guildMembers: AlbionMembersEntity[] = await this.albionMembersRepository.findAll();
    const length = guildMembers.length;

    if (length === 0) {
      await message.edit('## ❌ No members were found in the database!\nStill running reverse role scan...');
      // However, still perform the reverse role scan
      await this.reverseRoleScan(message, dryRun);
      return;
    }

    await message.channel.send(`ℹ️ There are currently ${guildMembers.length} registered members on record.`);

    let characters: Array<AlbionPlayerInterface | null>;

    try {
      await message.edit(`## Task: [1/4] Gathering ${length} characters from ALB API..`);
      characters = await this.gatherCharacters(guildMembers, message);
    }
    catch (err) {
      await message.edit('## ❌ An error occurred while gathering data from the API!');
      return;
    }

    if (characters.length === 0) {
      await message.edit('## ❌ No characters were gathered from the API!');
      return;
    }

    try {
      await message.edit(`## Task: [2/4] Checking ${length} characters for membership status...`);
      await this.removeLeavers(characters, message, dryRun);

      // Check if members have roles they shouldn't who are not registered
      await message.edit('## Task: [3/4] Performing reverse role scan...');
      await this.reverseRoleScan(message, dryRun);

      await message.edit('## Task: [4/4] Checking for role inconsistencies...');
      await this.roleInconsistencies(message, dryRun);
    }
    catch (err) {
      await message.edit('## ❌ An error occurred while scanning!');
      await message.channel.send(`Error: ${err.message}`);
    }

    // All done, clean up
    await message.channel.send('### Scan complete!');
    await message.delete();
  }

  async gatherCharacters(guildMembers: AlbionMembersEntity[], message: Message, tries = 0) {
    const characterPromises: Promise<AlbionPlayerInterface>[] = [];
    tries++;
    const length = guildMembers.length;

    const statusMessage = await message.channel.send(`Gathering ${length} characters from ALB API... (attempt #${tries})`);

    for (const member of guildMembers) {
      characterPromises.push(this.albionApiService.getCharacterById(member.characterId));
    }

    await statusMessage.delete();

    try {
      return await Promise.all(characterPromises);
    }
    catch (err) {
      if (tries === 3) {
        await statusMessage.channel.send(`## ❌ An error occurred while gathering data for ${length} characters! Giving up after 3 tries! Pinging <@${this.config.get('discord.devUserId')}>!`);
        return null;
      }

      await statusMessage.edit(`## ⚠️ Couldn't gather ${length} characters from ALB API. Retrying in 10s (attempt #${tries})...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      return this.gatherCharacters(guildMembers, statusMessage, tries);
    }
  }

  async removeLeavers(
    characters: AlbionPlayerInterface[],
    message: Message,
    dryRun = false
  ): Promise<void> {
    // Save all the characters to a map we can easily pick out later via character ID
    const charactersMap = new Map<string, AlbionPlayerInterface>();
    const leavers: string[] = [];
    for (const character of characters) {
      charactersMap.set(character.Id, character);
    }

    // Get the registered members from the database
    const guildMembers: AlbionMembersEntity[] = await this.albionMembersRepository.findAll();

    // Do the checks
    for (const member of guildMembers) {
      const character = charactersMap.get(member.characterId);

      let discordMember: GuildMember | null = null;

      try {
        discordMember = await message.guild.members.fetch({ user: member.discordId, force: true });
      }
      catch (err) {
        // No discord member means they've left the server. Remove them from the database and continue.
        this.logger.log(`User ${character.Name} has left the Discord server`);

        if (!dryRun) {
          await this.albionMembersRepository.removeAndFlush(member);
        }

        leavers.push(`- 🫥️ Discord member for Character **${character.Name}** has left the DIG server. Their registration status has been removed.`);
        continue;
      }

      // Is the character still in the Guild?
      if (character?.GuildId && character?.GuildId === this.config.get('albion.guildId')) {
        continue;
      }

      // If not in the guild, strip 'em
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
            await message.channel.send(`ERROR: Unable to remove role "${role.name}" from ${character.Name} (${character.Id}). Pinging <@${this.config.get('discord.devUserId')}>!`);
          }
        }
      }

      if (!dryRun) {
        try {
          await this.albionMembersRepository.removeAndFlush(member);
        }
        catch (err) {
          await message.channel.send(`ERROR: Unable to remove Albion Character "${character.Name}" (${character.Id}) from registration database! Pinging <@${this.config.get('discord.devUserId')}>!`);
        }
      }

      leavers.push(`- 👋 <@${discordMember.id}>'s character **${character.Name}** has left the Guild. Their roles and registration status have been stripped.`);
    }

    this.logger.log(`Found ${leavers.length} changes to make.`);

    if (leavers.length > 0) {
      this.logger.log(`Sending ${leavers.length} changes to channel...`);
      await message.channel.send(`## 🚪 ${leavers.length} leavers detected!`);

      for (const leaver of leavers) {
        await message.channel.send(leaver); // Send a fake message first so it doesn't ping people
      }
      return;
    }

    await message.channel.send('✅ No leavers were detected.');
    this.logger.log('No leavers were detected.');
  }

  async reverseRoleScan(message: Message, dryRun = false) {
    // Get the registered members from the database again as they may have changed
    const guildMembers: AlbionMembersEntity[] = await this.albionMembersRepository.findAll();

    // Loop through each role, starting with Guildmaster, and check if anyone has it who are not registered
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');
    const roleMapLength = roleMap.length;

    const scanMessage = await message.channel.send(`### Scanning ${roleMapLength} Discord roles for members who are not fully registered...`);
    const scanCountMessage = await message.channel.send('foo');

    const invalidUsers: string[] = [];

    // Loop each role and scan them
    let count = 0;
    for (const role of roleMap) {
      count++;
      let discordRole: Role;

      await scanCountMessage.edit(`Scanning role **${role.name}** [${count}/${roleMapLength}]...`);

      try {
        discordRole = message.guild.roles.cache.get(role.discordRoleId);
      }
      catch (err) {
        const error = `Reverse Role Scan: Error fetching role ${role.name}! Err: ${err.message}`;
        this.logger.error(error);
        throw new Error(error);
      }

      // If for some reason the role didn't throw an error but doesn't exist
      if (!discordRole) {
        const error = `Reverse Role Scan: Role ${role.name} does not seem to exist!`;
        this.logger.error(error);
        throw new Error(error);
      }

      // Get the members of the role
      const members = discordRole.members;
      if (!members) {
        this.logger.error(`Reverse Role Scan: No members were found for role ${role.name}!`);
        continue;
      }

      // Loop through each member and check if they're registered, if not strip 'em
      for (const [ref, discordMember] of members) {
        // Filter on guildMembers to find them by Discord ID
        const foundMember = guildMembers.filter((guildMember) => guildMember.discordId === discordMember.id)[0];

        if (!foundMember) {
          invalidUsers.push(`- ⚠️ <@${discordMember.id}> had role **${role.name}** but was not registered!`);

          if (!dryRun) {
            await discordMember.roles.remove(discordRole);
          }
        }
      }
    }

    await scanMessage.delete();
    await scanCountMessage.delete();

    // Display list of invalid users
    if (invalidUsers.length > 0) {
      await message.channel.send(`## 🚨 ${invalidUsers.length} invalid users detected via Reverse Role Scan!\nThese users have been **automatically** stripped of their roles.`);

      for (const invalidUser of invalidUsers) {
        const lineMessage = await message.channel.send('foo');
        await lineMessage.edit(invalidUser);
      }
      return;
    }
    else {
      await message.channel.send('✅ No invalid users were detected via Reverse Role Scan.');
    }
  }

  async roleInconsistencies(
    message: Message,
    dryRun = false
  ): Promise<void> {
    const suggestions: string[] = [];

    // Refresh GuildMembers as some may have been booted / left
    const guildMembers: AlbionMembersEntity[] = await this.albionMembersRepository.findAll();

    const scanCountMessage = await message.channel.send(`### Scanning ${guildMembers.length} members for role inconsistencies... [0/${guildMembers.length}]`);
    let count = 0;

    for (const member of guildMembers) {
      count++;

      if (count % 5 === 0) {
        await scanCountMessage.edit(`### Scanning ${guildMembers.length} members for role inconsistencies... [${count}/${guildMembers.length}]`);
      }
      let discordMember: GuildMember | null = null;

      try {
        discordMember = await message.guild.members.fetch({ user: member.discordId, force: true });
      }
      catch (err) {
        this.logger.warn(`Unable to fetch Discord member for ${member.characterName}! Assuming they've left the server, skipping suggestions for them.`);
        continue;
      }

      // Get the role inconsistencies
      const inconsistencies = await this.checkRoleInconsistencies(discordMember);

      // Construct the strings
      inconsistencies.forEach((inconsistency) => {
        suggestions.push(inconsistency.message);
      });
    }

    await scanCountMessage.delete();

    if (suggestions.length === 0) {
      await message.channel.send('✅ No role inconsistencies were detected.');
      return;
    }

    await message.channel.send(`## 👀 ${suggestions.length} role inconsistencies detected!`);

    for (const suggestion of suggestions) {
      if (!suggestion) {
        this.logger.error('Attempted to send empty suggestion!');
        continue;
      }
      const fakeMessage = await message.channel.send('---'); // Send a fake message first so it doesn't ping people
      await fakeMessage.edit(suggestion);
    }

    if (suggestions.length > 0 && !dryRun) {
      const scanPingRoles = this.config.get('albion.scanPingRoles');
      await message.channel.send(`🔔 <@&${scanPingRoles.join('>, <@&')}> Please review the above suggestions and make any necessary changes manually. To check again without pinging Guildmasters or Masters, run the \`/albion-scan\` command with the \`dry-run\` flag set to \`true\`.`);
    }

  }

  async checkRoleInconsistencies(discordMember: GuildMember): Promise<RoleInconsistencyResult[]> {
    // If the user is excluded from role inconsistency checks, skip them
    const excludedUsers: string[] = this.config.get('albion.scanExcludedUsers');
    if (excludedUsers.includes(discordMember.id)) {
      return [];
    }

    const inconsistencies: RoleInconsistencyResult[] = [];
    const highestPriorityRole = this.albionUtilities.getHighestAlbionRole(discordMember);
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');

    // If no roles were found, they must have at least registered and initiate
    if (!highestPriorityRole) {
      const initiateRole = roleMap.filter((role) => role.name === '@ALB/Initiate')[0];
      const registeredRole = roleMap.filter((role) => role.name === '@ALB/Registered')[0];
      const emoji = '⚠️';
      const action = 'added';
      const reason = 'they have no roles but are registered!';
      inconsistencies.push({
        id: initiateRole.discordRoleId,
        name: initiateRole.name,
        action,
        message: `- ${emoji} <@${discordMember.id}> requires role **${initiateRole.name}** to be ${action} because ${reason}`,
      });
      inconsistencies.push({
        id: registeredRole.discordRoleId,
        name: registeredRole.name,
        action,
        message: `- ${emoji} <@${discordMember.id}> requires role **${registeredRole.name}** to be ${action} because ${reason}`,
      });
      return inconsistencies;
    }

    roleMap.forEach((role) => {
      const shouldHaveRole = role.priority === highestPriorityRole?.priority || (role.priority > highestPriorityRole?.priority && role.keep);
      const hasRole = discordMember.roles.cache.has(role.discordRoleId);

      let changed = false;
      let emoji = '➕';
      let action = 'added' as 'added' | 'removed';
      let reason = `their highest role is **${highestPriorityRole.name}**, and the role is marked as "keep".`;

      if (shouldHaveRole && !hasRole) {
        changed = true;
      }

      if (!shouldHaveRole && hasRole && !role.keep) {
        changed = true;
        emoji = '➖';
        action = 'removed';
        reason = `their highest role is **${highestPriorityRole.name}**, and the role is not marked as "keep".`;
      }

      if (changed) {
        inconsistencies.push({
          id: role.discordRoleId,
          name: role.name,
          action,
          message: `- ${emoji} <@${discordMember.id}> requires role **${role.name}** to be ${action} because ${reason}`,
        });
      }
    });

    return inconsistencies;
  }
}

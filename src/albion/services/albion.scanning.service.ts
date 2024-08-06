import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, Message, Role } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { AlbionApiService } from './albion.api.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { AlbionRoleMapInterface } from '../../config/albion.app.config';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { AlbionGuildMembersEntity } from '../../database/entities/albion.guildmembers.entity';
import { AlbionDiscordEnforcementService } from './albion.discord.enforcement.service';

export interface RoleInconsistencyResult {
  id: string,
  name: string,
  action: 'added' | 'removed' | 'missingEntryRole', // For testing purposes
  message: string
}

@Injectable()
export class AlbionScanningService {
  private readonly logger = new Logger(AlbionScanningService.name);

  constructor(
    private readonly albionApiService: AlbionApiService,
    private readonly discordEnforcementService: AlbionDiscordEnforcementService,
    private readonly config: ConfigService,
    private readonly albionUtilities: AlbionUtilities,
    @InjectRepository(AlbionRegistrationsEntity) private readonly albionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
    @InjectRepository(AlbionGuildMembersEntity) private readonly albionGuildMembersRepository: EntityRepository<AlbionGuildMembersEntity>
  ) {
  }

  // Pull the list of verified members from the database and check if they're still in the Guild
  // If they're not, remove the ALB/Registered role from them and any other non opt-in Albion roles e.g. ALB/Initiate, ALB/Squire etc.
  // Also send a message to the #albion-scans channel to denote this has happened.
  async startScan(
    message: Message,
    dryRun = false,
    server: AlbionServer = AlbionServer.AMERICAS
  ) {
    const emoji = this.serverEmoji(server);
    const guildId = server === AlbionServer.AMERICAS ? this.config.get('albion.guildIdUS') : this.config.get('albion.guildIdEU');

    await message.edit(`# ${emoji} Starting scan...`);

    const guildMembers: AlbionRegistrationsEntity[] = await this.albionRegistrationsRepository.find({ guildId });
    const length = guildMembers.length;

    await message.channel.send(`${emoji} ℹ️ There are currently ${guildMembers.length} registered members on record.`);

    let characters: Array<AlbionPlayerInterface | null>;

    let actionRequired = false;

    try {
      await message.edit(`# ${emoji} Task: [1/5] Gathering ${length} characters from the ALB API...`);
      characters = await this.gatherCharacters(guildMembers, message, 0, server);
    }
    catch (err) {
      await message.edit(`## ${emoji} ❌ An error occurred while gathering data from the API!`);
      await message.channel.send(`Error: ${err.message}`);
      return;
    }

    if (characters.length === 0) {
      await message.edit(`## ${emoji} ❌ No characters were gathered from the API!`);
      return;
    }

    try {
      await message.edit(`# ${emoji} Task: [2/5] Checking ${length} characters for membership status...`);
      if (await this.removeLeavers(characters, message, dryRun, server)) actionRequired = true;

      // Check if members have roles they shouldn't have
      await message.edit(`# ${emoji} Task: [3/5] Performing reverse role scan...`);
      await this.reverseRoleScan(message, dryRun, server);

      await message.edit(`# ${emoji} Task: [4/5] Checking for role inconsistencies...`);
      if (await this.roleInconsistencies(message, dryRun, server)) actionRequired = true;

      await message.edit(`# ${emoji} Task: [5/5] Discord enforcement scan...`);
      await message.channel.send(`${emoji} DISCORD ENFORCEMENT SCAN DISABLED!`);
      // if (await this.discordEnforcementScan(message, dryRun, server)) actionRequired = true;
    }
    catch (err) {
      await message.edit('## 🇺🇸 ❌ An error occurred while scanning!');
      await message.channel.send(`Error: ${err.message}`);
    }

    // All done, clean up
    await message.channel.send(`## ${emoji} Scan complete!`);
    // If any of the tasks flagged for action, tell them now.
    if (actionRequired && !dryRun) {
      const configKey = server === AlbionServer.AMERICAS ? 'albion.pingLeaderRolesUS' : 'albion.pingLeaderRolesEU';
      const scanPingRoles = this.config.get(configKey);
      const text = `🔔 <@&${scanPingRoles.join('>, <@&')}> Please review the above actions marked with (‼️) and make any necessary changes manually. To scan again without pinging, run the \`/albion-scan\` command with the \`dry-run\` flag set to \`true\`.`;
      await message.channel.send(text);
    }
    await message.channel.send('------------------------------------------');

    await message.delete();
  }

  async gatherCharacters(
    guildMembers: AlbionRegistrationsEntity[],
    message: Message,
    tries = 0,
    server: AlbionServer = AlbionServer.AMERICAS
  ) {
    const emoji = this.serverEmoji(server);
    const characterPromises: Promise<AlbionPlayerInterface>[] = [];
    tries++;
    const length = guildMembers.length;
    if (tries > 3) {
      await message.channel.send(`## ❌ An error occurred while gathering data for ${length} characters! Giving up after 3 tries! Pinging <@${this.config.get('discord.devUserId')}>!`);
      return null;
    }
    const statusMessage = await message.channel.send(`${emoji} Gathering ${length} characters from the ${server} ALB API... (attempt #${tries})`);

    for (const member of guildMembers) {
      characterPromises.push(this.albionApiService.getCharacterById(member.characterId, server));
    }

    try {
      await statusMessage.delete();
      return await Promise.all(characterPromises);
    }
    catch (err) {
      await statusMessage.delete();
      const tempMessage = await message.channel.send(`## ⚠️ Couldn't gather characters from ${server} ALB API. Retrying in 10s...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      await tempMessage.delete();
      return this.gatherCharacters(guildMembers, message, tries, server);
    }
  }

  async removeLeavers(
    characters: AlbionPlayerInterface[],
    message: Message,
    dryRun = false,
    server: AlbionServer = AlbionServer.AMERICAS
  ): Promise<boolean> {
    const emoji = this.serverEmoji(server);
    const guildId = server === AlbionServer.AMERICAS ? this.config.get('albion.guildIdUS') : this.config.get('albion.guildIdEU');
    // Save all the characters to a map we can easily pick out later via character ID
    const charactersMap = new Map<string, AlbionPlayerInterface>();
    const leavers: string[] = [];
    for (const character of characters) {
      charactersMap.set(character.Id, character);
    }

    // Get the registered members from the database
    const registeredMembers: AlbionRegistrationsEntity[] = await this.albionRegistrationsRepository.find({ guildId });

    const statusMessage = await message.channel.send(`### ${emoji} Scanned 0/${registeredMembers.length} registered members...`);

    let count = 0;
    let actionRequired = false;

    const roleMaps: AlbionRoleMapInterface = this.config.get('albion.roleMap');

    // Force a role fetch for each role, so we get an accurate list of members
    for (const roleMap of Object.values(roleMaps)) {
      // Force fetch the role, so we get a proper list of updated members
      await message.guild.roles.fetch(roleMap.discordRoleId, { force: true });
    }

    // Do the checks
    for (const member of registeredMembers) {
      let leftServer = false;
      let leftGuild = false;
      count++;

      if (count % 5 === 0) {
        await statusMessage.edit(`### Scanned ${count}/${registeredMembers.length} registered members...`);
      }
      const character = charactersMap.get(member.characterId);

      if (!character) {
        throw new Error('Character vanished!');
      }

      // 1. Check if they're still in the guild
      // Is the character still in the Guild?
      if (!character?.GuildId || character?.GuildId !== guildId) {
        this.logger.log(`User ${character.Name} has left the Guild`);
        leftGuild = true;
      }

      // 2. Check if they're still on the Discord server
      let discordMember: GuildMember | null = null;

      try {
        discordMember = await message.guild.members.fetch({ user: member.discordId, force: true });
      }
      catch (err) {
        // No discord member means they've left the server. Flag them as removed and proceed with guild check.
        this.logger.log(`User ${character.Name} has left the Discord server`);
        leftServer = true;
      }

      // If they remain, nothing left to do
      if (!leftGuild && !leftServer) {
        continue;
      }

      // Construct the appropriate message
      if (leftGuild && leftServer) {
        leavers.push(`- ${emoji} 💁 Character / Player ${character.Name} has left **both** the DIG server and the Guild. They are dead to us now 💅`);
      }
      else if (leftGuild && discordMember) {
        leavers.push(`- ${emoji} 👋 <@${discordMember.id}>'s character **${character.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
      }
      else if (leftServer) {
        leavers.push(`- ${emoji} ‼️🫥️ Discord member for Character **${character.Name}** has left the DIG Discord server. Their registration status has been removed. **They require booting from the Guild!**`);
        actionRequired = true;
      }

      // If dry run, nothing left to do.
      if (dryRun) {
        continue;
      }

      // Delete their registration record
      try {
        await this.albionRegistrationsRepository.removeAndFlush(member);
      }
      catch (err) {
        await message.channel.send(`ERROR: Unable to remove Albion Character "${character.Name}" (${character.Id}) from registration database! Pinging <@${this.config.get('discord.devUserId')}>!`);
      }

      // If Discord member does not exist, there are no discord actions to take.
      if (!discordMember) {
        continue;
      }

      // Strip their roles if they still remain on the server
      // Remove all roles from the user
      for (const roleMap of Object.values(roleMaps)) {
        // If role is not for the correct server, skip it
        if (roleMap.server !== server) {
          continue;
        }

        // Force fetch the role, so we get a proper list of updated members
        const role = message.guild.roles.cache.get(roleMap.discordRoleId);
        // Check if the user still has the role
        const hasRole = role.members.has(discordMember.id);

        if (hasRole) {
          try {
            await discordMember.roles.remove(roleMap.discordRoleId);
          }
          catch (err) {
            await message.channel.send(`ERROR: Unable to remove role "${role.name}" from ${character.Name} (${character.Id}). Err: "${err.message}". Pinging <@${this.config.get('discord.devUserId')}>!`);
          }
        }
      }
    }

    this.logger.log(`Found ${leavers.length} changes to make.`);

    await statusMessage.delete();

    if (leavers.length === 0) {
      await message.channel.send(`${emoji} ✅ No leavers were detected.`);
      this.logger.log('No leavers were detected.');
      return actionRequired;
    }

    this.logger.log(`Sending ${leavers.length} changes to channel...`);
    await message.channel.send(`## ${emoji} 🚪 ${leavers.length} leavers detected!`);

    for (const leaver of leavers) {
      await message.channel.send(leaver); // Send a fake message first, so it doesn't ping people
    }

    return actionRequired;
  }

  async reverseRoleScan(
    message: Message,
    dryRun = false,
    server: AlbionServer = AlbionServer.AMERICAS
  ) {
    const guildId = server === AlbionServer.AMERICAS ? this.config.get('albion.guildIdUS') : this.config.get('albion.guildIdEU');
    const emoji = this.serverEmoji(server);

    // Get the list of roles via the Role Map
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');
    // Filter to only the server we care about
    const roleMapServer = roleMap.filter((role) => role.server === server);
    const roleMapLength = roleMapServer.length;

    const scanMessage = await message.channel.send(`### ${emoji} Scanning ${roleMapLength} Discord roles for members who are falsely registered...`);
    const scanCountMessage = await message.channel.send('.');

    // Get the registered members from the database again as they may have changed
    const albGuildMembers: AlbionRegistrationsEntity[] = await this.albionRegistrationsRepository.find({ guildId });

    const errorsDetected: string[] = [];

    // Loop each role and scan them
    let count = 0;
    for (const role of roleMapServer) {
      count++;
      let discordRole: Role;

      await scanCountMessage.edit(`Scanning role **${role.name}** [${count}/${roleMapLength}]...`);

      try {
        // Force fetch the role to get the correct members
        discordRole = await message.guild.roles.fetch(
          role.discordRoleId,
          { cache: false, force: true }
        );
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
      const roleMembers = discordRole.members;
      if (!roleMembers) {
        this.logger.error(`Reverse Role Scan: No members were found for role ${role.name}!`);
        continue;
      }

      // Loop through each member and check if they're registered, if not strip 'em
      for (const [, discordMember] of roleMembers) {
        // Check if the Discord member shows up on the server's guild registered list
        const foundMember = albGuildMembers.filter((albGuildMember) => albGuildMember.discordId === discordMember.id)[0];

        if (!foundMember) {
          let discordMemberFresh: GuildMember;

          // Check if the member actually exists first before removing their roles
          try {
            discordMemberFresh = await message.guild.members.fetch({ user: discordMember.id, force: true });

            // If since the cache time the member has left, they won't be found and no actions can be taken upon them anyway.
            if (!discordMemberFresh) {
              this.logger.error('Reverse Role Scan: Discord member does not actually exist!');
              continue;
            }

            // Now check if the user actually has the role, rather than assuming they do as they're not a registered member
            const hasRole = discordMemberFresh.roles.cache.has(discordRole.id);

            if (hasRole) {
              const dryRunText = dryRun ? ' (DRY RUN)' : '';
              // Member actually has the role, now remove it from them
              errorsDetected.push(`- ⚠️${dryRunText} <@${discordMemberFresh.id}> had role **${role.name}** but was not registered!`);

              if (!dryRun) {
                try {
                  await discordMemberFresh.roles.remove(discordRole);
                  this.logger.debug(`Reverse Role Scan: Removed role from user ${discordMemberFresh.id}!`);
                }
                catch (err) {
                  this.logger.error(`Reverse Role Scan: Error removing role ${role.name} from user ${discordMemberFresh.id}! Err: ${err.message}`);
                  await message.channel.send(`Error removing role "${role.name}" from user ${discordMemberFresh.displayName}! Err: ${err.message}. Pinging <@${this.config.get('discord.devUserId')}>!`);
                }
              }
              else {
                this.logger.log(`Reverse Role Scan: Would have removed role "${role.name}" from user ${discordMemberFresh.id}!`);
              }
            }
          }
          catch {
            this.logger.error('Reverse Role Scan: Discord member does not actually exist (and errored!)');
          }
        }
      }
    }

    await scanMessage.delete();
    await scanCountMessage.delete();

    // Display list of invalid users
    if (errorsDetected.length > 0) {
      await message.channel.send(`## ${emoji} 🚨 ${errorsDetected.length} errors detected via Reverse Role Scan!\nAffected users have been **automatically** stripped of their incorrect roles.`);

      for (const invalidUser of errorsDetected) {
        const lineMessage = await message.channel.send('.');
        await lineMessage.edit(invalidUser);
      }
    }
    else {
      await message.channel.send(`${emoji} ✅ No invalid users were detected via Reverse Role Scan.`);
    }
  }

  async roleInconsistencies(
    message: Message,
    dryRun = false,
    server: AlbionServer = AlbionServer.AMERICAS
  ): Promise<boolean> {
    const suggestions: string[] = [];
    const emoji = this.serverEmoji(server);
    const guildId = server === AlbionServer.AMERICAS ? this.config.get('albion.guildIdUS') : this.config.get('albion.guildIdEU');
    let actionRequired = false;

    // Refresh GuildMembers as some may have been booted / left
    const guildMembers: AlbionRegistrationsEntity[] = await this.albionRegistrationsRepository.find({ guildId });

    const scanCountMessage = await message.channel.send(`## ${emoji} Scanning ${guildMembers.length} members for role inconsistencies... [0/${guildMembers.length}]`);
    let count = 0;

    for (const member of guildMembers) {
      count++;

      if (count % 5 === 0) {
        await scanCountMessage.edit(`## ${emoji} Scanning ${guildMembers.length} members for role inconsistencies... [${count}/${guildMembers.length}]`);
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
      const inconsistencies = await this.checkRoleInconsistencies(discordMember, server);

      if (inconsistencies.length > 0) {
        actionRequired = true;
      }

      // Construct the strings
      inconsistencies.forEach((inconsistency) => {
        suggestions.push(inconsistency.message);
      });
    }

    await scanCountMessage.delete();

    if (suggestions.length === 0) {
      await message.channel.send(`${emoji} ✅ No role inconsistencies were detected.`);
      return false;
    }

    await message.channel.send(`## ${emoji} 👀 ${suggestions.length} role inconsistencies detected!`);

    for (const suggestion of suggestions) {
      if (!suggestion) {
        this.logger.error('Attempted to send empty suggestion!');
        continue;
      }
      const fakeMessage = await message.channel.send('---'); // Send a fake message first, so it doesn't ping people
      await fakeMessage.edit(suggestion);
    }

    if (suggestions.length > 0 && !dryRun) {
      actionRequired = true;
    }

    return actionRequired;
  }

  async checkRoleInconsistencies(
    discordMember: GuildMember,
    server: AlbionServer = AlbionServer.AMERICAS
  ): Promise<RoleInconsistencyResult[]> {
    const serverEmoji = this.serverEmoji(server);
    // If the user is excluded from role inconsistency checks, skip them
    const excludedUsers: string[] = this.config.get('albion.scanExcludedUsers');
    if (excludedUsers.includes(discordMember.id)) {
      return [];
    }

    const inconsistencies: RoleInconsistencyResult[] = [];
    const highestPriorityRole = this.albionUtilities.getHighestAlbionRole(discordMember, server);
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');

    // If no roles were found, they must have at least registered and initiate
    if (!highestPriorityRole) {
      let entryRole: AlbionRoleMapInterface;
      let registeredRole: AlbionRoleMapInterface;

      if (server === AlbionServer.EUROPE) {
        entryRole = roleMap.filter((role) => role.name === '@ALB/Disciple')[0];
        registeredRole = roleMap.filter((role) => role.name === '@ALB/Registered')[0];
      }
      else {
        throw new Error('Invalid server!');
      }

      const action = 'added';
      const reason = 'they have no roles but are registered!';
      inconsistencies.push({
        id: entryRole.discordRoleId,
        name: entryRole.name,
        action,
        message: `- ${serverEmoji} ‼️ <@${discordMember.id}> requires role **${entryRole.name}** to be ${action} because ${reason}`,
      });
      inconsistencies.push({
        id: registeredRole.discordRoleId,
        name: registeredRole.name,
        action,
        message: `- ${serverEmoji} ‼️ <@${discordMember.id}> requires role **${registeredRole.name}** to be ${action} because ${reason}`,
      });
      return inconsistencies;
    }

    // If their highest role is registered, this shouldn't be the case. They should have at least the entry level role.
    // We need to get the role for the server they're on, and the priority above the registered priority.
    if (highestPriorityRole.name.includes('Registered')) {
      const entryRole = roleMap.filter((role) => role.server === server && role.priority === highestPriorityRole.priority - 1)[0];
      const action = 'added';
      const reason = 'they are registered but don\'t have at least the entry level role!';

      inconsistencies.push({
        id: entryRole.discordRoleId,
        name: entryRole.name,
        action,
        message: `- ${serverEmoji} ‼️ <@${discordMember.id}> requires role **${entryRole.name}** to be ${action} because ${reason}`,
      });
      return inconsistencies;
    }

    // Otherwise, this is based off priority of the highest priority role.
    roleMap.forEach((role) => {
      // If the role is for the wrong server, skip it
      if (role.server !== server) {
        return;
      }
      const shouldHaveRole = role.priority === highestPriorityRole?.priority || (role.priority > highestPriorityRole?.priority && role.keep);
      const hasRole = discordMember.roles.cache.has(role.discordRoleId);

      let changed = false;
      let emoji = `${serverEmoji} ➕`;
      let action = 'added' as 'added' | 'removed';
      let reason = `their highest role is **${highestPriorityRole.name}**, and the role is marked as "keep".`;

      if (shouldHaveRole && !hasRole) {
        changed = true;
      }

      if (!shouldHaveRole && hasRole && !role.keep) {
        changed = true;
        emoji = `${serverEmoji} ➖`;
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

  serverEmoji(server: AlbionServer) {
    return server === AlbionServer.AMERICAS ? '🇺🇸' : '🇪🇺';
  }
}

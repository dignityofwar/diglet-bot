import { Injectable, Logger } from '@nestjs/common';
import { Collection, GuildMember, Message, Role } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { ActivityService } from './activity.service';
import { ConfigService } from '@nestjs/config';
import { getChannel } from '../../discord/discord.hacks';

export interface PurgableMemberList {
  purgableMembers: Collection<string, GuildMember>;
  purgableByGame: {
    ps2: Collection<string, GuildMember>;
    ps2Verified: Collection<string, GuildMember>;
    foxhole: Collection<string, GuildMember>;
    albion: Collection<string, GuildMember>;
    albionRegistered: Collection<string, GuildMember>;
  };
  totalMembers: number;
  totalBots: number;
  totalHumans: number;
  inGracePeriod: number;
  inactive: number;
}

@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly activityService: ActivityService,
    private readonly config: ConfigService,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: EntityRepository<ActivityEntity>,
  ) {}

  preflightChecks(message: Message) {
    const onboardedRole = message.guild.roles.cache.find(
      (role) => role.name === 'Onboarded',
    );
    const ps2Role = message.guild.roles.cache.find(
      (role) => role.name === 'Rec/Planetside2',
    );
    const ps2VerifiedRole = message.guild.roles.cache.find(
      (role) => role.name === 'Rec/PS2/Verified',
    );
    const foxholeRole = message.guild.roles.cache.find(
      (role) => role.name === 'Rec/Foxhole',
    );
    const albionRole = message.guild.roles.cache.find(
      (role) => role.name === 'Albion Online',
    );
    const albionRegistered = message.guild.roles.cache.find(
      (role) => role.name === 'ALB/Registered',
    );

    const devUserId = this.config.get('discord.devUserId');

    // 1. Preflight checks
    if (!onboardedRole) {
      throw new Error(
        `Could not find Onboarded role! Pinging Bot Dev <@${devUserId}>!`,
      );
    }

    if (!ps2Role) {
      throw new Error(
        `Could not find Rec/Planetside2 role! Pinging Bot Dev <@${devUserId}>!`,
      );
    }

    if (!ps2VerifiedRole) {
      throw new Error(
        `Could not find Rec/PS2/Verified role! Pinging Bot Dev <@${devUserId}>!`,
      );
    }

    if (!foxholeRole) {
      throw new Error(
        `Could not find Rec/Foxhole role! Pinging Bot Dev <@${devUserId}>!`,
      );
    }

    if (!albionRole) {
      throw new Error(
        `Could not find Albion Online role! Pinging Bot Dev <@${devUserId}>!`,
      );
    }

    if (!albionRegistered) {
      throw new Error(
        `Could not find Albion Online registered role(s)! Pinging Bot Dev <@${devUserId}>!`,
      );
    }

    return {
      onboardedRole,
      ps2Role,
      ps2VerifiedRole,
      foxholeRole,
      albionRole,
      albionRegistered,
    };
  }

  async startPurge(
    originMessage: Message,
    dryRun = true,
    interactionMember: GuildMember | null = null,
  ): Promise<void> {
    const statusMessage = await getChannel(originMessage).send(
      'Snapping fingers...',
    );

    let purgables: PurgableMemberList;

    try {
      purgables = await this.getPurgableMembers(originMessage, dryRun);
    }
    catch (err) {
      const string = `## ❌ Error commencing the purge!\n${err.message}`;
      this.logger.error(string);
      await statusMessage.channel.send(string);
      return;
    }

    if (purgables.purgableMembers.size === 0) {
      const string =
        '## ✅ All members are active and onboarded.\nThey have been saved from Thanos, this time...';
      this.logger.log(string);
      await getChannel(originMessage).send(string);
      return;
    }

    await statusMessage.edit(
      `Found ${purgables.purgableMembers.size} members who have disobeyed Thanos...\nI don't feel too good Mr Stark...`,
    );

    // I don't feel too good Mr Stark...
    await getChannel(originMessage).send(
      'https://media2.giphy.com/media/XzkGfRsUweB9ouLEsE/giphy.gif',
    );

    // Let the purge commence...
    try {
      await this.kickPurgableMembers(
        originMessage,
        purgables.purgableMembers,
        dryRun,
      );
    }
    catch (err) {
      const string = `## ❌ Error purging members!\n${err.message}`;
      this.logger.error(string);
      await statusMessage.edit(string);
      return;
    }

    // Thanos is pleased
    await getChannel(originMessage).send(
      'https://media1.tenor.com/m/g0oFjHy6W1cAAAAC/thanos-smile.gif',
    );

    await getChannel(originMessage).send('## ✅ Purge complete.');
    await this.generateReport(purgables, originMessage);

    if (interactionMember) {
      await getChannel(originMessage).send(
        `Thanos thanks you for your service, <@${interactionMember.user.id}>.`,
      );
    }
  }

  async getPurgableMembers(
    message: Message,
    dryRun = true,
  ): Promise<PurgableMemberList> {
    let onboardedRole: Role;
    let ps2Role: Role;
    let ps2VerifiedRole: Role;
    let foxholeRole: Role;
    let albionRole: Role;
    let albionRegistered: Role;

    try {
      const roles = this.preflightChecks(message);
      onboardedRole = roles.onboardedRole;
      ps2Role = roles.ps2Role;
      ps2VerifiedRole = roles.ps2VerifiedRole;
      foxholeRole = roles.foxholeRole;
      albionRole = roles.albionRole;
      albionRegistered = roles.albionRegistered;
    }
    catch (err) {
      const string = `Preflight checks failed! Err: ${err.message}`;
      this.logger.error(string);
      throw new Error(string);
    }

    // 2. Get a list of active members and hydrate their cache.
    const statusMessage = await getChannel(message).send(
      'Collating Active Discord Members...',
    );
    // Check the active members, and while we're at it remove any that are no longer on the server.
    const activeMembers = await this.resolveActiveMembers(message, dryRun);

    // 3. Get all members from the cache.
    this.logger.log('Fetching All Discord server members...');
    let members: Collection<string, GuildMember>;
    try {
      members = await message.guild.members.fetch();
    }
    catch (err) {
      const string = `Error fetching Discord server members. Err: ${err.message}`;
      this.logger.error(string);
      await getChannel(message).send(string);
      return;
    }
    this.logger.log(`${members.size} members found`);
    await statusMessage.edit(
      `${members.size} members found. Sorting members...`,
    );

    // Sort the members alphabetically, so we don't lose our minds in the output
    members = this.sortMembers(members);
    // Convert to an array for easier slicing and batching.
    const membersArray = Array.from(members.values());
    const batchSize = 25; // Define the size of each batch

    // Refresh the cache of each member
    await statusMessage.edit(
      `Refreshing member cache [0/${members.size}] (0%)...`,
    );
    for (let m = 0; m < members.size; m += batchSize) {
      const batch = membersArray.slice(m, m + batchSize);
      const promises = batch.map((member) => member.fetch());

      try {
        await Promise.all(promises);
      }
      catch (err) {
        const string = `Error refreshing member cache. Err: ${err.message}`;
        await getChannel(message).send(string);
        this.logger.error(string);
      }

      const percent = Math.floor((m / members.size) * 100);

      await statusMessage.edit(
        `Refreshing member cache [${m}/${members.size}] (${percent}%)...`,
      );
    }

    await statusMessage.edit('Crunching the numbers...');

    // Filter out bots and people who are onboarded already
    const results = {
      purgableMembers: members.filter((member) =>
        this.isPurgable(member, activeMembers, onboardedRole),
      ),
      purgableByGame: {
        ps2: members.filter(
          (member) =>
            this.isPurgable(member, activeMembers, onboardedRole) &&
            member.roles.cache.has(ps2Role.id),
        ),
        ps2Verified: members.filter(
          (member) =>
            this.isPurgable(member, activeMembers, onboardedRole) &&
            member.roles.cache.has(ps2VerifiedRole.id),
        ),
        foxhole: members.filter(
          (member) =>
            this.isPurgable(member, activeMembers, onboardedRole) &&
            member.roles.cache.has(foxholeRole.id),
        ),
        albion: members.filter(
          (member) =>
            this.isPurgable(member, activeMembers, onboardedRole) &&
            member.roles.cache.has(albionRole.id),
        ),
        albionRegistered: members.filter(
          (member) =>
            this.isPurgable(member, activeMembers, onboardedRole) &&
            member.roles.cache.has(albionRegistered.id),
        ),
      },
      totalMembers: members.size,
      totalBots: members.filter((member) => member.user.bot).size,
      totalHumans: members.filter((member) => !member.user.bot).size,
      inGracePeriod: members.filter((member) => {
        // If in 1 weeks grace period
        if (member.joinedTimestamp > Date.now() - 604800000) {
          return true;
        }
      }).size,
      inactive: members.filter((member) => {
        if (!activeMembers.has(member.user.id)) {
          return true;
        }
      }).size,
    };

    await statusMessage.delete();

    return results;
  }

  // Builds a map of active members and hydrates their GuildMember objects, for later negative comparison in isPurgable.
  async resolveActiveMembers(
    message: Message,
    dryRun: boolean,
  ): Promise<Collection<string, GuildMember>> {
    this.logger.log('Getting active Discord members...');
    let count = 0;

    const activeMembers: Collection<string, GuildMember> = new Collection();
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 90);

    const activeRecords = await this.activityRepository.find({
      lastActivity: { $gt: thresholdDate },
    });

    const statusMessage = await getChannel(message).send(
      `Getting active Discord members [0/${activeRecords.length}] (0%)...`,
    );

    for (const activeMember of activeRecords) {
      count++;

      if (count % 50 === 0 || count === activeRecords.length) {
        const percent = Math.floor(
          (count / activeRecords.length) * 100,
        ).toFixed(0);
        const string = `Getting active Discord members [${count}/${activeRecords.length}] (${percent}%)...`;
        await statusMessage.edit(string);
        this.logger.debug(string);
      }
      const guildMember = await this.discordService.getGuildMember(
        message.guild.id,
        activeMember.discordId,
      );

      // If the member is not found, remove their activity record as they're no longer on the server as it's pointless to keep it.
      if (!guildMember) {
        this.logger.warn(
          `Member ${activeMember.discordNickname} was not found on the server, removing from activity records.`,
        );

        try {
          await this.activityService.removeActivityRecord(activeMember, dryRun);
        }
        catch (err) {
          const devUserId = this.config.get('discord.devUserId');
          const error = `Error removing activity record for leaver ${activeMember.discordNickname} (${activeMember.discordId}). Error: ${err.message}`;
          this.logger.error(error);
          await getChannel(message).send(`<@${devUserId}> ${error}`);
        }
        continue;
      }
      activeMembers.set(activeMember.discordId, guildMember);
    }

    const string = `Detected **${activeMembers.size}** active members!`;
    this.logger.log(string);
    await getChannel(message).send(string);
    await statusMessage.delete();

    return activeMembers;
  }

  // Determines if a member is purgable or not. Returns true if they are.
  isPurgable(
    member: GuildMember,
    activeMembers: Collection<string, GuildMember>,
    onboardedRole: Role,
  ): boolean {
    // Ignore bots.
    if (member.user.bot) {
      return false;
    }

    // Ignore the DIG Admin account
    if (member.user.id === '808064520265924689') {
      return false;
    }

    const weekInMs = 604800000;
    // Don't boot people brand new to the server, give them 1 weeks grace period.
    if (member.joinedTimestamp > Date.now() - weekInMs) {
      return false;
    }

    // If not in the active members map, and are outside their grace period, boot them.
    // @See resolveActiveMembers
    if (!activeMembers.has(member.user.id)) {
      return true;
    }

    // If all else does not match, if they don't have the onboarded role, boot them.
    return !member.roles.cache.has(onboardedRole.id);
  }

  async kickPurgableMembers(
    message: Message,
    purgableMembers: Collection<string, GuildMember>,
    dryRun = true,
  ): Promise<void> {
    await getChannel(message).send(
      `Kicking ${purgableMembers.size} purgable members...`,
    );
    let lastKickedMessage =
      await getChannel(message).send('Kicking started...');

    this.logger.log(`Kicking ${purgableMembers.size} purgable members...`);
    let count = 0;
    const total = purgableMembers.size;
    let lastKickedString = '';
    const prefix = `${dryRun ? '[DRY RUN] ' : ''}`;

    for (const member of purgableMembers.values()) {
      count++;

      const name =
        member.displayName || member.nickname || member.user.username;
      const date = new Date().toLocaleString();

      if (!dryRun) {
        const dmMessage = `Hello from DIG!\n
We have removed you from the DIG Discord server due to either:
- Failing to complete the onboarding process to our server within 1 week of joining.
- Being inactive for 90 days. 
  - We choose to keep our server member counts as accurate as possible so we don't impose the impression we are larger than we actually are, and to keep our game role statistics accurate. We use these heavily to determine how active each of our games are.

Should you believe this to be in error, or you simply wish to rejoin, please click here: https://discord.gg/joinDIG

Otherwise, thank you for having joined us, and we wish you all the best. Please note messages to this bot are not monitored.

DIG Community Staff`;
        await this.discordService.sendDM(member, dmMessage);

        await this.discordService.kickMember(
          member,
          message,
          `Automatic purge: ${date}`,
        );
        // Removal of activity records is handled by the guildRemoveMember event listener.
      }
      this.logger.log(`Kicked ${name} (${member.user.id})`);
      lastKickedString += `- ${prefix}🥾 Kicked ${name} (${member.user.id})\n`;

      // Every 5 members or last member, send a status update
      if (count % 5 === 0 || count === total) {
        const percent = Math.floor((count / total) * 100);
        const progress = `[${count}/${total}] (${percent}%)`;
        await getChannel(message).send(lastKickedString);
        lastKickedString = '';

        await this.discordService.deleteMessage(lastKickedMessage); // Deletes last message, so we can re-new it and bring progress to the bottom
        lastKickedMessage = await getChannel(message).send(
          `${prefix}🫰 Kicking progress: ${progress}`,
        );

        this.logger.log(`Kicking progress: ${progress}`);
      }
    }

    this.logger.log(`${purgableMembers.size} members purged.`);
    await getChannel(message).send(
      `${prefix}**${purgableMembers.size}** members purged.`,
    );
  }

  sortMembers(
    members: Collection<string, GuildMember>,
  ): Collection<string, GuildMember> {
    return members.sort((a, b) => {
      const aName = a.displayName || a.nickname || a.user.username;
      const bName = b.displayName || b.nickname || b.user.username;
      if (aName < bName) {
        return -1;
      }
      if (aName > bName) {
        return 1;
      }
      return 0;
    });
  }

  async generateReport(
    purgables: PurgableMemberList,
    originMessage: Message,
  ): Promise<void> {
    // Hold a list of member IDs that will be sent by the below
    const gameMemberIds: string[] = [];

    // Loop through purgable members by game, batch sending the members in each game
    for (const game in purgables.purgableByGame) {
      if (
        !purgables.purgableByGame[game] ||
        purgables.purgableByGame[game].size === 0
      ) {
        continue;
      }

      const batch: string[] = [];
      purgables.purgableByGame[game].each((member: GuildMember) => {
        const name =
          member.displayName || member.nickname || member.user.username;
        batch.push(
          `- [${game.toUpperCase()}] <@${member.user.id}> / ${name}, joined <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n`,
        );
        gameMemberIds.push(member.user.id);
      });
      await getChannel(originMessage).send(`### ${game.toUpperCase()}`);

      await this.discordService.batchSend(batch, originMessage);
    }

    // Now loop through the purgable members in its entirety, reference to the gameMemberIds array to see if the member has already been sent.
    // If not, they don't belong to a particular community game, thus will be marked as NONE.
    const batch: string[] = [];
    purgables.purgableMembers.each((member: GuildMember) => {
      if (!gameMemberIds.includes(member.user.id)) {
        const name =
          member.displayName || member.nickname || member.user.username;
        batch.push(
          `- [NO-GAME] <@${member.user.id}> / ${name}, joined <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n`,
        );
      }
    });

    await getChannel(originMessage).send('### No game role');

    // Go through the batches by groups of 20 and spit out the members
    await this.discordService.batchSend(batch, originMessage);

    const percent = Math.floor(
      (purgables.purgableMembers.size / purgables.totalHumans) * 100,
    ).toFixed(1);
    const inactivePercent = Math.floor(
      (purgables.inactive / purgables.purgableMembers.size) * 100,
    ).toFixed(1);
    const nonOnboarders = purgables.purgableMembers.size - purgables.inactive;
    const nonOnboardersPercent = Math.floor(
      (nonOnboarders / purgables.purgableMembers.size) * 100,
    ).toFixed(1);

    this.logger.log(
      `Purge complete. ${purgables.purgableMembers.size} members purged. ${percent}% of total humans purged.`,
    );

    const purgeReport = `## 📜 Purge Report
- Total members at start of purge: **${purgables.totalMembers}**
- Total members at end of purge: **${purgables.totalMembers - purgables.purgableMembers.size}**
- Total humans at start of purge: **${purgables.totalHumans}**
- Total humans at end of purge: **${purgables.totalHumans - purgables.purgableMembers.size}**
- ⏳ Members in 1 week grace period: **${purgables.inGracePeriod}**
- 👞 Humans purged: **${purgables.purgableMembers.size}** (${percent}% of total humans on server)
- 😴 Humans inactive: **${purgables.inactive}** (${inactivePercent}% of purged)
- 🫨 Humans who failed to onboard: **${nonOnboarders}** (${nonOnboardersPercent}% of purged)`;

    const gameStatsReport = `## Game stats
Note, these numbers will not add up to total numbers, as a member can be in multiple games.
- Total PS2 purged: **${purgables.purgableByGame.ps2.size}**
- Total PS2 verified purged: **${purgables.purgableByGame.ps2Verified.size}**
- Total Foxhole purged: **${purgables.purgableByGame.foxhole.size}**
- Total Albion purged: **${purgables.purgableByGame.albion.size}**
- Total Albion Registered purged: **${purgables.purgableByGame.albionRegistered.size}**`;

    await getChannel(originMessage).send(purgeReport);
    await getChannel(originMessage).send(gameStatsReport);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import {
  Collection,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Message,
  MessageReaction,
  Role,
  Snowflake,
} from 'discord.js';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionRoleMapInterface } from '../../config/albion.app.config';
import { ALBION_GUILD_EMOJI } from '../interfaces/albion.api.interfaces';
import { DiscordService } from '../../discord/discord.service';
import { getChannel } from '../../discord/discord.hacks';

// Every line of the pings embed reads "<emoji> ALB/Name - description". Only the role token is
// load bearing: anyone who shouldn't be there loses every ping role and every reaction they
// hold, so nothing needs to know which emoji belongs to which role.
export const PING_ROLE_TOKEN = /\bALB\/[A-Za-z0-9_-]+/g;

// reaction.users.fetch() returns 100 at most, so a popular ping needs paging or everyone past
// the first page is invisible to the sweep. The page cap is a runaway guard, nothing more.
const REACTION_PAGE_SIZE = 100;
const MAX_REACTION_PAGES = 50;

// A safety valve for the first live run, which has years of drift to clear. Whatever is left
// over is picked up by the next run rather than hammering the API in one go.
export const MAX_REACTION_REMOVALS_PER_RUN = 500;

// Progress edits cost an API call of their own, on the tightest bucket in the sweep
export const PROGRESS_EDIT_INTERVAL_MS = 2000;

export interface PingRoleSet {
  roles: Collection<Snowflake, Role>;
  // Role names in the embed that match no Discord role. Reported rather than dropped, since
  // it means the embed and the server have drifted apart.
  unresolved: string[];
}

export interface PingsMessageSet {
  messages: Message[];
  // IDs that are configured but could not be fetched. Reported rather than fatal: a message the
  // sweep can't see means less gets cleaned up, never that the wrong person gets stripped.
  failed: string[];
}

export interface PingRoleStripResult {
  discordId: string;
  rolesRemoved: string[];
  reactionsRemoved: number;
  errors: string[];
}

@Injectable()
export class AlbionPingRoleService {
  private readonly logger = new Logger(AlbionPingRoleService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    @InjectRepository(AlbionRegistrationsEntity) private readonly albionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
  ) {}

  // Null means "ping roles could not be established". Callers must treat it as do-nothing:
  // a failed fetch reading as an empty role list would strip the entire server.
  async getPingRoles(guild: Guild, messages: Message[]): Promise<PingRoleSet | null> {
    if (messages.length === 0) {
      return null;
    }

    const text = messages.map((message) => this.extractText(message)).join('\n');
    const tokens = [...new Set(text.match(PING_ROLE_TOKEN) ?? [])];

    if (tokens.length === 0) {
      this.logger.error('Ping Roles: No ALB/ role names found in the pings messages!');
      return null;
    }

    const guildRoles = await this.discordService.getAllRolesFromGuild(guild);
    const rankRoleIds = new Set(
      (this.config.get('albion.roleMap') as AlbionRoleMapInterface[]).map((role) => role.discordRoleId),
    );

    const roles = new Collection<Snowflake, Role>();
    const unresolved: string[] = [];

    for (const token of tokens) {
      const role = guildRoles.find((guildRole) => guildRole.name === token);

      if (!role) {
        unresolved.push(token);
        continue;
      }

      // Rank roles share the ALB/ prefix. Excluded by ID whatever the embed happens to say,
      // so a stray mention of a rank in the text can never strip someone of their rank.
      if (rankRoleIds.has(role.id)) {
        this.logger.warn(`Ping Roles: Ignoring rank role "${role.name}" found in the pings message.`);
        continue;
      }

      roles.set(role.id, role);
    }

    if (roles.size === 0) {
      this.logger.error('Ping Roles: None of the role names in the pings messages resolved to a Discord role!');
      return null;
    }

    return { roles, unresolved };
  }

  // Fetched fresh every time. The embeds are edited by hand whenever a ping role is added, and
  // a cached copy would keep the sweep working off the old list.
  async getPingsMessages(): Promise<PingsMessageSet> {
    const messageIds: string[] = this.config.get('albion.pingsMessageIds') ?? [];
    const channelId = this.config.get('discord.channels.albionRoles');
    const result: PingsMessageSet = { messages: [], failed: [] };

    if (messageIds.length === 0) {
      this.logger.warn('Ping Roles: No pings message IDs are configured, skipping.');
      return result;
    }

    for (const messageId of messageIds) {
      try {
        const channel = await this.discordService.getTextChannel(channelId);
        result.messages.push(await channel.messages.fetch(messageId));
      }
      catch (err) {
        result.failed.push(messageId);
        this.logger.error(`Ping Roles: Failed to fetch pings message ${messageId}! Err: ${err.message}`);
      }
    }

    return result;
  }

  extractText(message: Message): string {
    const parts: string[] = [message.content ?? ''];

    for (const embed of message.embeds ?? []) {
      parts.push(embed.title ?? '', embed.description ?? '');

      for (const field of embed.fields ?? []) {
        parts.push(field.name ?? '', field.value ?? '');
      }
    }

    return parts.join('\n');
  }

  // Who has reacted to the pings messages, by Discord ID. Users who have left the server still
  // appear here - Discord never prunes reactions - which is exactly the drift being cleaned up.
  async fetchReactors(messages: Message[]): Promise<Map<Snowflake, MessageReaction[]>> {
    const reactors = new Map<Snowflake, MessageReaction[]>();

    for (const reaction of this.allReactions(messages)) {
      let after: Snowflake | undefined;

      for (let page = 0; page < MAX_REACTION_PAGES; page++) {
        const users = await reaction.users.fetch({ limit: REACTION_PAGE_SIZE, after });

        if (users.size === 0) {
          break;
        }

        for (const [discordId, user] of users) {
          if (user.bot) {
            continue;
          }
          reactors.set(discordId, [...(reactors.get(discordId) ?? []), reaction]);
        }

        if (users.size < REACTION_PAGE_SIZE) {
          break;
        }

        after = users.lastKey();
      }
    }

    return reactors;
  }

  // Every reaction across every pings message, flattened. The same emoji on two messages is two
  // distinct reactions, so they can't be deduplicated by emoji.
  allReactions(messages: Message[]): MessageReaction[] {
    return messages.flatMap((message) => [...message.reactions.cache.values()]);
  }

  isExempt(member: GuildMember | null): boolean {
    if (!member) {
      return false;
    }

    const exemptRoles: string[] = this.config.get('albion.pingRoleExemptRoles') ?? [];

    return exemptRoles.some((roleId) => member.roles.cache.has(roleId));
  }

  async removePingRoles(
    member: GuildMember,
    pingRoles: Collection<Snowflake, Role>,
    dryRun: boolean,
  ): Promise<{ removed: string[], errors: string[] }> {
    const removed: string[] = [];
    const errors: string[] = [];

    for (const role of pingRoles.values()) {
      if (!member.roles.cache.has(role.id)) {
        continue;
      }

      removed.push(role.name);

      if (dryRun) {
        continue;
      }

      try {
        await member.roles.remove(role.id);
      }
      catch (err) {
        errors.push(`Failed to remove role "${role.name}" from <@${member.id}>: ${err.message}`);
        this.logger.error(`Ping Roles: Failed to remove role ${role.name} from ${member.id}! Err: ${err.message}`);
      }
    }

    return { removed, errors };
  }

  // Reactions can only be removed, never added on someone's behalf, so clearing them is what
  // lets a returning member opt back in by clicking the emoji again.
  async removeReactions(
    reactions: MessageReaction[],
    discordId: Snowflake,
    dryRun: boolean,
  ): Promise<{ removed: number, errors: string[] }> {
    const errors: string[] = [];
    let removed = 0;

    for (const reaction of reactions) {
      removed++;

      if (dryRun) {
        continue;
      }

      try {
        await reaction.users.remove(discordId);
      }
      catch (err) {
        removed--;
        errors.push(`Failed to remove reaction ${reaction.emoji.name} from <@${discordId}>: ${err.message}`);
        this.logger.error(`Ping Roles: Failed to remove reaction from ${discordId}! Err: ${err.message}`);
      }
    }

    return { removed, errors };
  }

  // Called from deregistration, so it runs for every leaver the scan finds and for every manual
  // deregistration. discordMember is null when they have already left the server, in which case
  // there are no roles left to strip but their reactions outlive them.
  async stripForDeregistration(
    discordId: Snowflake,
    discordMember: GuildMember | null,
    responseChannel: GuildTextBasedChannel,
  ): Promise<PingRoleStripResult | null> {
    // Alliance members hold ping roles without ever registering. Exempt uniformly rather
    // than only in the sweep, so leaving the guild but staying in the alliance keeps the pings.
    if (this.isExempt(discordMember)) {
      this.logger.log(`Ping Roles: ${discordId} holds an exempt role, leaving their ping roles alone.`);
      return null;
    }

    const { messages } = await this.getPingsMessages();

    if (messages.length === 0) {
      return null;
    }

    const result: PingRoleStripResult = {
      discordId,
      rolesRemoved: [],
      reactionsRemoved: 0,
      errors: [],
    };

    if (discordMember) {
      const pingRoles = await this.getPingRoles(discordMember.guild, messages);

      if (pingRoles) {
        const roleResult = await this.removePingRoles(discordMember, pingRoles.roles, false);
        result.rolesRemoved = roleResult.removed;
        result.errors.push(...roleResult.errors);
      }
    }

    // Every reaction on every message is attempted rather than paging the reactor lists first:
    // deregistrations are rare and one-by-one, and the delete is a no-op if they never reacted.
    const reactionResult = await this.removeReactions(
      this.allReactions(messages),
      discordId,
      false,
    );
    result.reactionsRemoved = reactionResult.removed;
    result.errors.push(...reactionResult.errors);

    if (result.rolesRemoved.length > 0 || result.reactionsRemoved > 0) {
      await responseChannel.send(
        `${ALBION_GUILD_EMOJI} 🧹 Removed ${result.rolesRemoved.length} ping role(s) and ${result.reactionsRemoved} ping reaction(s) from <@${discordId}>.`,
      );
    }

    for (const error of result.errors) {
      await responseChannel.send(`⚠️ ${error} Pinging <@${this.config.get('discord.devUserId')}>!`);
    }

    return result;
  }

  // The reconciliation sweep. Clears historic drift the deregistration hook can't reach: people
  // who left before the hook existed, and people who left the Discord server outright.
  async reconcile(
    scanMessage: Message,
    dryRun = false,
    heading = `# ${ALBION_GUILD_EMOJI} Sweeping ping roles...`,
  ): Promise<boolean> {
    const emoji = ALBION_GUILD_EMOJI;
    const guild = scanMessage.guild;
    const { messages, failed } = await this.getPingsMessages();

    if (messages.length === 0) {
      await getChannel(scanMessage).send(`${emoji} ⚠️ Ping role sweep skipped: no pings messages could be read.`);
      return false;
    }

    // One unreadable message out of several only means less gets swept, so the run continues -
    // but silently sweeping half the pings is how this stops being noticed, hence the shout.
    if (failed.length > 0) {
      await getChannel(scanMessage).send(
        `${emoji} ⚠️ ${failed.length} configured pings message(s) could not be read, so their roles and reactions were skipped: **${failed.join('**, **')}**.`,
      );
    }

    const pingRoleSet = await this.getPingRoles(guild, messages);

    if (!pingRoleSet) {
      await getChannel(scanMessage).send(`${emoji} ⚠️ Ping role sweep skipped: no ping roles could be resolved from the pings messages.`);
      return false;
    }

    const { roles: pingRoles, unresolved } = pingRoleSet;

    if (unresolved.length > 0) {
      await getChannel(scanMessage).send(
        `${emoji} ⚠️ The pings messages name ${unresolved.length} role(s) that don't exist on the server: **${unresolved.join('**, **')}**. Fix the message or the role names.`,
      );
    }

    // Full member list rather than role.members, which only reflects whatever happens to be
    // cached and quietly undercounts.
    const members = await guild.members.fetch();
    const reactors = await this.fetchReactors(messages);

    const registeredIds = new Set(
      (await this.albionRegistrationsRepository.find({ guildId: this.config.get('albion.guildId') }))
        .map((registration) => registration.discordId),
    );

    const candidates = new Set<Snowflake>(reactors.keys());

    // Bots are dropped in the candidate loop below, which is the one place both sources meet
    for (const [discordId, member] of members) {
      if (pingRoles.some((role) => member.roles.cache.has(role.id))) {
        candidates.add(discordId);
      }
    }

    const dryRunText = dryRun ? ' (DRY RUN)' : '';
    const changes: string[] = [];
    const errors: string[] = [];
    let reactionsRemoved = 0;
    let capped = 0;
    let processed = 0;

    const progress = this.progressReporter(scanMessage, heading, candidates.size);

    for (const discordId of candidates) {
      const member = members.get(discordId) ?? null;

      // Reports what is finished, before starting this one - so the counts never run ahead
      await progress.update(processed, reactionsRemoved);
      processed++;

      if (member?.user.bot) {
        continue;
      }
      if (registeredIds.has(discordId)) {
        continue;
      }
      if (this.isExempt(member)) {
        continue;
      }

      const rolesRemoved = member
        ? await this.removePingRoles(member, pingRoles, dryRun)
        : { removed: [], errors: [] };
      errors.push(...rolesRemoved.errors);

      const memberReactions = reactors.get(discordId) ?? [];
      let reactionCount = 0;

      if (reactionsRemoved + memberReactions.length > MAX_REACTION_REMOVALS_PER_RUN) {
        capped += memberReactions.length;
      }
      else {
        const reactionResult = await this.removeReactions(memberReactions, discordId, dryRun);
        reactionCount = reactionResult.removed;
        reactionsRemoved += reactionCount;
        errors.push(...reactionResult.errors);
      }

      if (rolesRemoved.removed.length === 0 && reactionCount === 0) {
        continue;
      }

      const status = member ? 'is not registered' : 'has left the Discord server';
      changes.push(
        `- ${emoji} 🧹${dryRunText} <@${discordId}> ${status}: removed ${rolesRemoved.removed.length} ping role(s) and ${reactionCount} reaction(s).`,
      );
    }

    await progress.finish(processed, reactionsRemoved);

    await this.report(scanMessage, changes, errors, capped, pingRoles, members, dryRun);

    return changes.length > 0;
  }

  // Editing the scan message as it goes, so a sweep clearing hundreds of reactions doesn't look
  // hung. Throttled, and the clock starts before the first member, so a short sweep edits nothing.
  private progressReporter(scanMessage: Message, heading: string, total: number) {
    let lastEditAt = Date.now();
    let emitted = false;

    const edit = async (processed: number, reactionsRemoved: number): Promise<void> => {
      const percent = total > 0 ? Math.floor((processed / total) * 100) : 100;

      try {
        await scanMessage.edit(`${heading} [${processed}/${total}] (${percent}%) — ${reactionsRemoved} reaction(s) removed`);
      }
      catch (err) {
        // A failed progress edit must never take the sweep down with it
        this.logger.warn(`Ping Roles: Failed to update sweep progress. Err: ${err.message}`);
      }
    };

    return {
      update: async (processed: number, reactionsRemoved: number): Promise<void> => {
        if (Date.now() - lastEditAt < PROGRESS_EDIT_INTERVAL_MS) {
          return;
        }

        lastEditAt = Date.now();
        emitted = true;
        await edit(processed, reactionsRemoved);
      },
      // Only when progress was reported at all, otherwise the heading is still accurate
      finish: async (processed: number, reactionsRemoved: number): Promise<void> => {
        if (emitted) {
          await edit(processed, reactionsRemoved);
        }
      },
    };
  }

  private async report(
    scanMessage: Message,
    changes: string[],
    errors: string[],
    capped: number,
    pingRoles: Collection<Snowflake, Role>,
    members: Collection<Snowflake, GuildMember>,
    dryRun: boolean,
  ): Promise<void> {
    const emoji = ALBION_GUILD_EMOJI;
    const dryRunText = dryRun ? ' (DRY RUN)' : '';

    if (changes.length === 0) {
      await getChannel(scanMessage).send(`${emoji} ✅ No ping role inconsistencies were detected.`);
    }
    else {
      await getChannel(scanMessage).send(`## ${emoji} 🧹${dryRunText} ${changes.length} member(s) stripped of ping roles!`);

      for (const change of changes) {
        const lineMessage = await getChannel(scanMessage).send('.');
        await lineMessage.edit(change);
      }
    }

    if (capped > 0) {
      await getChannel(scanMessage).send(
        `${emoji} ℹ️ ${capped} reaction(s) were left for the next run to avoid hammering Discord's API.`,
      );
    }

    for (const error of errors) {
      await getChannel(scanMessage).send(`⚠️ ${error} Pinging <@${this.config.get('discord.devUserId')}>!`);
    }

    // The whole point of the sweep: the counts on the roles are now a live membership count.
    const counts = pingRoles
      .map((role) => `- **${role.name}**: ${members.filter((member) => member.roles.cache.has(role.id)).size}`)
      .join('\n');

    await getChannel(scanMessage).send(`### ${emoji} Ping role membership\n${counts}`);
  }
}

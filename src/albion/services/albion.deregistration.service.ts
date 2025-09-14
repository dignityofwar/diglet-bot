import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@mikro-orm/nestjs";
import { AlbionRegistrationsEntity } from "../../database/entities/albion.registrations.entity";
import { EntityRepository } from "@mikro-orm/core";
import { GuildMember, GuildTextBasedChannel } from "discord.js";
import { AlbionRoleMapInterface } from "../../config/albion.app.config";
import { DiscordService } from "../../discord/discord.service";
import { AlbionDeregisterDto } from "../dto/albion.deregister.dto";

@Injectable()
export class AlbionDeregistrationService {
  private readonly logger = new Logger(AlbionDeregistrationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    @InjectRepository(AlbionRegistrationsEntity)
    private readonly albionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
  ) {}

  // Deregister a user from the Albion Online guild
  async deregister(
    responseChannel: GuildTextBasedChannel,
    dto: AlbionDeregisterDto,
  ) {
    // If neither were supplied, throw
    if (!dto.character && !dto.discordMember) {
      throw new Error(
        "Either character or discordId must be provided for deregistration.",
      );
    }

    const discordId = dto.discordMember ?? null;

    // If we got a discordId, find it via that
    let registration: AlbionRegistrationsEntity | null = null;
    if (discordId) {
      registration = await this.albionRegistrationsRepository.findOne({
        discordId,
      });
    }

    // If we have a character, find it via that
    if (dto.character && !registration) {
      registration = await this.albionRegistrationsRepository.findOne({
        characterName: dto.character,
      });
    }

    if (!registration) {
      const error = dto.character
        ? `No registration found for character "${dto.character}"!`
        : `No registration found for Discord User ID "${dto.discordMember}"!`;
      this.logger.error(error);
      await responseChannel.send(`❌ ${error}`);
      return;
    }

    // Get the discord user
    let discordMember: GuildMember | null = null;

    try {
      discordMember = await this.discordService.getGuildMember(
        responseChannel.guild.id,
        registration.discordId,
        true,
      );
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // No discord member means they've left the server.
      this.logger.warn(
        `User ${registration.characterName} has left the Discord server, no actions will be taken for Discord roles.`,
      );
    }

    await this.stripRegistration(registration, responseChannel);

    if (!discordMember) {
      const error = `Discord Member with ID "${registration.discordId}" not found in Discord! They have likely left the server, so no roles can be stripped.`;
      this.logger.warn(error);
      await responseChannel.send(`⚠️ ${error}`);
      return;
    }

    await this.stripRoles(discordMember, responseChannel);
  }

  async stripRegistration(
    registration: AlbionRegistrationsEntity,
    responseChannel: GuildTextBasedChannel,
  ): Promise<void> {
    // Remove the registration record from the database
    try {
      await this.albionRegistrationsRepository
        .getEntityManager()
        .removeAndFlush(registration);
      await responseChannel.send(
        `Successfully deregistered Character ${registration.characterName}.`,
      );
    } catch (err) {
      await responseChannel.send(
        `ERROR: Failed to deregister character "${registration.characterName}" (${registration.characterId}) from registration database!\nError: "${err.message}". Pinging <@${this.config.get("discord.devUserId")}>!`,
      );
    }
  }

  async stripRoles(
    discordMember: GuildMember,
    responseChannel: GuildTextBasedChannel,
  ): Promise<void> {
    // List all the albion roles to remove.
    const roleMaps: AlbionRoleMapInterface = this.config.get("albion.roleMap");

    // Strip their roles if they still remain on the server
    for (const roleMap of Object.values(roleMaps)) {
      // Force fetch the role, so we get a proper list of updated members
      const role = await this.discordService.getRoleViaMember(
        discordMember,
        roleMap.discordRoleId,
      );
      // Check if the user still has the role
      const hasRole = role.members.has(discordMember.id);

      if (!hasRole) {
        continue; // Nothing to do, they don't have the role.
      }

      try {
        await discordMember.roles.remove(roleMap.discordRoleId);
      } catch (err) {
        await responseChannel.send(
          `ERROR: Unable to remove role "${role.name}" from ${discordMember.user.username} (${discordMember.id}). Err: "${err.message}". Pinging <@${this.config.get("discord.devUserId")}>!`,
        );
      }
    }
  }
}

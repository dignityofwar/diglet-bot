import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { CensusApiService } from '../service/census.api.service';
import { PS2GameVerificationService } from '../service/ps2.game.verification.service';
import { PS2VerifyManualDto } from '../dto/PS2VerifyManualDto';

@Command({
  name: 'ps2-verify-manual',
  type: ApplicationCommandType.ChatInput,
  description: 'Manually verify a character in the DIG Outfit',
})
@Injectable()
export class PS2VerifyManualCommand {
  private readonly logger = new Logger(PS2VerifyManualCommand.name);

  constructor(
    private readonly censusApiService: CensusApiService,
    private readonly config: ConfigService,
    private readonly ps2GameVerificationService: PS2GameVerificationService,
  ) {}

  @Handler()
  async onPS2VerifyManualCommand(
    @InteractionEvent(SlashCommandPipe) dto: PS2VerifyManualDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<string> {
    this.logger.debug(`Received onPS2VerifyManualCommand with character ${dto.character}`);
    // Check if the command came from the correct channel ID
    const verifyChannelId = this.config.get('discord.channels.ps2Verify');

    // Check if channel is correct
    if (interaction[0].channelId !== verifyChannelId) {
      return `Please use the <#${verifyChannelId}> channel to register.`;
    }

    // Get the target and createdBy Discord guild members to be able to edit things about them
    const targetMember = await interaction[0].guild?.members.fetch(dto.discordId);
    const createdByMember = await interaction[0].guild?.members.fetch(interaction[0].user.id);

    if (!targetMember) {
      return `The Discord user <@${dto.discordId}> could not be found.`;
    }

    let character: CensusCharacterWithOutfitInterface;

    // Get the character from the Albion Online API
    try {
      character = await this.censusApiService.getCharacter(dto.character);
    }
    catch (err) {
      if (err instanceof Error) {
        return err.message;
      }
    }

    // If a force remove, skip all the extra checks
    if (dto.remove) {
      await this.ps2GameVerificationService.forceRemove(character, targetMember, createdByMember);
      return 'Member manually unverified.';
    }

    const outfitId = this.config.get('ps2.outfitId');

    // Check if the character is in the PS2 Outfit
    if (!character?.outfit_info || character?.outfit_info.outfit_id !== outfitId) {
      return `The character **${character.name.first}** has not been detected in the [DIG]. Please try again.`;
    }

    // Check first if the registration is valid
    const isValid = await this.ps2GameVerificationService.isValidRegistrationAttempt(character, targetMember);

    if (isValid !== true) {
      return isValid;
    }

    await this.ps2GameVerificationService.forceAdd(character, targetMember, createdByMember);

    // Successful, but send nothing back as we send a separate message as the command may fail due to census being slow.
    return 'Member manually verified.';
  }
}

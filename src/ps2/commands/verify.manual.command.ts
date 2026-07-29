import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { CensusApiService } from '../service/census.api.service';
import { PS2GameVerificationService } from '../service/ps2.game.verification.service';
import { PS2VerifyManualDto } from '../dto/PS2VerifyManualDto';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class PS2VerifyManualCommand {
  private readonly logger = new Logger(PS2VerifyManualCommand.name);

  constructor(
    private readonly censusApiService: CensusApiService,
    private readonly config: ConfigService,
    private readonly ps2GameVerificationService: PS2GameVerificationService,
  ) {}

  @SlashCommand({
    name: 'ps2-verify-manual',
    description: 'Manually verify a character in the DIG Outfit',
  })
  async onPS2VerifyManualCommand(
    @Options() dto: PS2VerifyManualDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    this.logger.debug(`Received onPS2VerifyManualCommand with character ${dto.character}`);
    // API and database work happens before the first reply, which blows Discord's 3s window.
    await interaction.deferReply();
    // Check if the command came from the correct channel ID
    const verifyChannelId = this.config.get('discord.channels.ps2Verify');

    // Check if channel is correct
    if (interaction.channelId !== verifyChannelId) {
      return replyTo(interaction, `Please use the <#${verifyChannelId}> channel to register.`);
    }

    // Get the target and createdBy Discord guild members to be able to edit things about them
    const targetMember = await interaction.guild?.members.fetch(dto.discordUser.id);
    const createdByMember = await interaction.guild?.members.fetch(interaction.user.id);

    if (!targetMember) {
      return replyTo(interaction, `The Discord user <@${dto.discordUser.id}> could not be found.`);
    }

    let character: CensusCharacterWithOutfitInterface;

    // Get the character from the Albion Online API
    try {
      character = await this.censusApiService.getCharacter(dto.character);
    }
    catch (err) {
      if (err instanceof Error) {
        return replyTo(interaction, err.message);
      }
    }

    // If a force remove, skip all the extra checks
    if (dto.remove) {
      await this.ps2GameVerificationService.forceRemove(character, targetMember, createdByMember);
      return replyTo(interaction, 'Member manually unverified.');
    }

    const outfitId = this.config.get('ps2.outfitId');

    // Check if the character is in the PS2 Outfit
    if (!character.outfit_info || character.outfit_info?.outfit_id !== outfitId) {
      return replyTo(interaction, `The character **${character.name.first}** has not been detected in the [DIG]. Please try again.`);
    }

    // Check first if the registration is valid
    const isValid = await this.ps2GameVerificationService.isValidRegistrationAttempt(character, targetMember);

    if (isValid !== true) {
      return replyTo(interaction, isValid);
    }

    await this.ps2GameVerificationService.forceAdd(character, targetMember, createdByMember);

    // Successful, but send nothing back as we send a separate message as the command may fail due to census being slow.
    return replyTo(interaction, 'Member manually verified.');
  }
}

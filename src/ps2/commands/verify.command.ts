import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { CensusApiService } from '../service/census.api.service';
import { PS2VerifyDto } from '../dto/PS2VerifyDto';
import { PS2GameVerificationService } from '../service/ps2.game.verification.service';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class PS2VerifyCommand {
  private readonly logger = new Logger(PS2VerifyCommand.name);

  constructor(
    private readonly censusApiService: CensusApiService,
    private readonly config: ConfigService,
    private readonly ps2GameVerificationService: PS2GameVerificationService,
  ) {}

  @SlashCommand({
    name: 'ps2-verify',
    description: 'Verify your character in the DIG Outfit',
  })
  async onPS2VerifyCommand(
    @Options() dto: PS2VerifyDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    this.logger.debug(`Received PS2VerifyCommand with character ${dto.character}`);
    // API and database work happens before the first reply, which blows Discord's 3s window.
    await interaction.deferReply();
    // Check if the command came from the correct channel ID
    const verifyChannelId = this.config.get('discord.channels.ps2Verify');

    // Check if channel is correct
    if (interaction.channelId !== verifyChannelId) {
      return replyTo(interaction, `Please use the <#${verifyChannelId}> channel to register.`);
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

    const outfitId = this.config.get('ps2.outfitId');

    // Check if the character is in the PS2 Outfit
    if (!character.outfit_info || character.outfit_info?.outfit_id !== outfitId) {
      return replyTo(interaction, `Your character **${character.name.first}** has not been detected in the [DIG] outfit. If you are in the outfit, please log out and in again, or wait 24 hours and try again as Census (the game's API) can be slow to update sometimes.`);
    }

    // Get the Discord guild member to be able to edit things about them
    const guildMember = await interaction.guild?.members.fetch(interaction.user.id);

    // Check first if the registration is valid
    const isValid = await this.ps2GameVerificationService.isValidRegistrationAttempt(character, guildMember);

    if (isValid !== true) {
      return replyTo(interaction, isValid);
    }

    this.ps2GameVerificationService.watch(character, guildMember);

    // Successful, but send nothing back as we send a separate message as the command may fail due to census being slow.
    return replyTo(interaction, '==================\nVerification started, if the bot hasn\'t responded within 30 seconds, please try again.');
  }
}

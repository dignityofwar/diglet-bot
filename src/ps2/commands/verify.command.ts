import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { CensusApiService } from '../service/census.api.service';
import { PS2VerifyDto } from '../dto/PS2VerifyDto';
import { PS2GameVerificationService } from '../service/ps2.game.verification.service';

@Command({
  name: 'ps2-verify',
  type: ApplicationCommandType.ChatInput,
  description: 'Verify your character in the DIG Outfit',
})
@Injectable()
export class PS2VerifyCommand {
  private readonly logger = new Logger(PS2VerifyCommand.name);

  constructor(
    private readonly censusApiService: CensusApiService,
    private readonly config: ConfigService,
    private readonly ps2GameVerificationService: PS2GameVerificationService,
  ) {}

  @Handler()
  async onPS2VerifyCommand(
    @InteractionEvent(SlashCommandPipe) dto: PS2VerifyDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<string> {
    this.logger.debug(`Received PS2VerifyCommand with character ${dto.character}`);
    // Check if the command came from the correct channel ID
    const verifyChannelId = this.config.get('discord.channels.ps2Verify');

    // Check if channel is correct
    if (interaction[0].channelId !== verifyChannelId) {
      return `Please use the <#${verifyChannelId}> channel to register.`;
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

    const outfitId = this.config.get('app.ps2.outfitId');

    // Check if the character is in the Albion guild
    if (!character?.outfit_info || character?.outfit_info.outfit_id !== outfitId) {
      return `Your character "${character.name.first}" has not been detected in the [DIG] outfit. If you are in the outfit, please log out and in again, or wait 24 hours and try again as Census (the game's API) can be slow to update sometimes.`;
    }

    // Get the Discord guild member to be able to edit things about them
    const guildMember = await interaction[0].guild?.members.fetch(interaction[0].user.id);

    // Check first if the registration is valid
    const isValid = await this.ps2GameVerificationService.isValidRegistrationAttempt(character, guildMember);

    if (isValid !== true) {
      return isValid;
    }

    await this.ps2GameVerificationService.watch(character, guildMember);

    // Successful!
    return `Your character "${character.name.first}" has been detected as a member of DIG. However, to fully verify you, you now need follow the below steps.`;
  }
}

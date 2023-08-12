import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { Injectable } from '@nestjs/common';
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
  constructor(
    private readonly censusService: CensusApiService,
    private readonly config: ConfigService,
    private readonly ps2GameVerificationService: PS2GameVerificationService,
  ) {}

  @Handler()
  async onPS2VerifyCommand(
    @InteractionEvent(SlashCommandPipe) dto: PS2VerifyDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<string> {
    // Check if the command came from the correct channel ID
    const verifyChannelId = this.config.get('discord.channels.ps2Verify');

    // Check if channel is correct
    if (interaction[0].channelId !== verifyChannelId) {
      return `Please use the <#${verifyChannelId}> channel to register.`;
    }

    // Find the PS2/Verified role
    const verifiedRoleId = this.config.get('discord.roles.ps2Verified');
    const verifiedRole = await interaction[0].guild?.roles.fetch(verifiedRoleId);

    if (!verifiedRole) {
      return `Unable to find the PS2/Verified role! Pinging <@${this.config.get('discord.devUserId')}>!`;
    }

    let character: CensusCharacterWithOutfitInterface;

    // Get the character from the Albion Online API
    try {
      character = await this.censusService.getCharacter(dto.character);
    }
    catch (err) {
      if (err instanceof Error) {
        return err.message;
      }
    }

    const outfitId = this.config.get('app.ps2.outfitId');

    // Check if the character is in the Albion guild
    if (!character.outfit_info || character.outfit_info.outfit_id !== outfitId) {
      return `Your character "${character.name.first}" has not been detected in the [DIG] outfit. If you are in the outfit, please log out and in again, or wait 24 hours and try again as Census (the game's API) can be slow to update sometimes.`;
    }

    // Now we need to send a message to the user with instructions on how to verify themselves in game.

    // 1. Send a DM to the user with instructions on how to verify themselves in game.
    // 2. Send a message to the verification channel with the user's name and character name.
    // 3. Add a reaction to the message in the verification channel.
    // 4. Wait for the user to perform the actions required
    // 5. Once confirmed, add the role to the user and change their nickname to their character name.
    // 6. Send a message to the user to confirm they have been verified.

    // At this point the character is fully verified they exist and are in the outfit, and are legitimate via ingame verification.

    // Get the Discord guild member to be able to edit things about them
    const guildMember = await interaction[0].guild?.members.fetch(interaction[0].user.id);

    // Edit their nickname to match their ingame
    try {
      await guildMember?.setNickname(character.name.first);
    }
    catch (err) {
      return `Unable to set your nickname. If you're an admin this won't work as the bot has no power over you! Pinging <@${this.config.get('discord.devUserId')}>!`;
    }

    // Add the PS2/verified role
    try {
      await guildMember?.roles.add(verifiedRole);
    }
    catch (err) {
      return `Unable to add the PS2/Verified role to user! Pinging <@${this.config.get('discord.devUserId')}>!`;
    }

    this.ps2GameVerificationService.watch(character, guildMember);

    // Successful!
    return `Your character "${character.name.first}" has been detected as a member of DIG. However, to fully verify you, you now need to kill yourself with a **VS Plasma Grenade**. You have 5 minutes to do this as of now!`;
  }
}

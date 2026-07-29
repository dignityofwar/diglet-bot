import { BooleanOption, StringOption, UserOption } from 'necord';
import { User } from 'discord.js';

export class PS2VerifyManualDto {
  @StringOption({
    name: 'character-name',
    description:
      'Name of the in-game Planetside 2 Character to link.',
    required: true,
    min_length: 3,
    max_length: 32,
  })
  character: string;
  @UserOption({
    name: 'discord-user',
    description:
      'Select the Discord user to apply the verification to.',
    required: true,
  })
  discordUser: User;

  @BooleanOption({
    name: 'remove',
    description:
    'Remove verification status instead of adding',
    required: false,
  })
  remove: boolean;
}

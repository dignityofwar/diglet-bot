import { StringOption, UserOption } from 'necord';
import { User } from 'discord.js';

export class AlbionDeregisterDto {
  @StringOption({
    name: 'character-name',
    description:
      'Name of the character in game',
    required: false,
    min_length: 3,
    max_length: 16,
  })
  character?: string;

  @UserOption({
    name: 'discord-member',
    description:
      'Discord User to deregister.',
    required: false,
  })
  discordMember?: User;
}

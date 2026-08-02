import { StringOption, UserOption } from 'necord';
import { User } from 'discord.js';

export class AlbionForceRegisterDto {
  @StringOption({
    name: 'character-name',
    description:
      'Exact in-game Albion character name. Guild membership is not checked, so be careful!',
    required: true,
    min_length: 3,
    max_length: 16,
  })
  character: string;

  @UserOption({
    name: 'discord-member',
    description:
      'Discord member the character belongs to.',
    required: true,
  })
  discordMember: User;
}

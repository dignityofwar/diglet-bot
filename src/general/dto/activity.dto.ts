import { BooleanOption, UserOption } from 'necord';
import { User } from 'discord.js';

export class ActivityDto {
  @UserOption({
    name: 'member',
    description: 'Discord member to report on.',
    required: true,
  })
  member: User;

  @BooleanOption({
    name: 'show-in-channel',
    description:
      'Post the report in this channel for everyone to see. Leave unset and only you will see it.',
    required: false,
  })
  // Defaulted at the use site — necord ignores field initialisers on option DTOs.
  showInChannel: boolean;
}

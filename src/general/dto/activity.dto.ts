import { UserOption } from 'necord';
import { User } from 'discord.js';

export class ActivityDto {
  @UserOption({
    name: 'member',
    description: 'Discord member to report on.',
    required: true,
  })
  member: User;
}

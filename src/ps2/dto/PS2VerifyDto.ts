import { StringOption } from 'necord';

export class PS2VerifyDto {
  @StringOption({
    name: 'character-name',
    description:
      'Name of your in-game Planetside 2 Character, case insensitive. This must be exact!',
    required: true,
    min_length: 3,
    max_length: 32,
  })
  character: string;
}

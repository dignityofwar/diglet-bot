import { StringOption } from 'necord';

export class AlbionRegisterDto {
  @StringOption({
    name: 'character-name',
    description:
      'Name of your in-game Albion Character. This must be exact!',
    required: true,
    min_length: 3,
    max_length: 16,
  })
  character: string;
}

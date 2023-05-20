import { Param } from '@discord-nestjs/core';

export class AlbionRegisterDto {
  @Param({
    name: 'character-name',
    description:
      'Name of your in-game Albion Character. This must be exact!',
    required: true,
    minLength: 3,
    maxLength: 16,
  })
    character: string;

}

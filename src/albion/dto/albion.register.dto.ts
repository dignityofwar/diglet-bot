import { Choice, Param } from '@discord-nestjs/core';
import { AlbionServer } from '../interfaces/albion.api.interfaces';

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

  @Choice(AlbionServer)
  @Param({
    name: 'server',
    description:
      'Which server are you on? Americas or Europe?',
    required: true,
  })
    server: AlbionServer;
}

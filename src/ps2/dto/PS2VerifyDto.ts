import { Param } from '@discord-nestjs/core';

export class PS2VerifyDto {
  @Param({
    name: 'character-name',
    description:
      'Name of your in-game Planetside 2 Character, case insensitive. This must be exact!',
    required: true,
    minLength: 3,
    maxLength: 32,
  })
    character: string;
}

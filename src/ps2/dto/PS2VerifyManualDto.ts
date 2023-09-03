import { Param, ParamType } from '@discord-nestjs/core';

export class PS2VerifyManualDto {
  @Param({
    name: 'character-name',
    description:
      'Name of the in-game Planetside 2 Character to link.',
    required: true,
    minLength: 3,
    maxLength: 32,
  })
    character: string;
  @Param({
    name: 'discord-user',
    description:
      'Select the Discord user to apply the verification to.',
    required: true,
    type: ParamType.USER,
  })
    discordId: string;

@Param({
  name: 'remove',
  description:
    'Remove verification status instead of adding',
  required: false,
  type: ParamType.BOOLEAN,
})
  remove: boolean;
}

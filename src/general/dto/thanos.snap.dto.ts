import { Param, ParamType } from '@discord-nestjs/core';

export class ThanosSnapDto {
  @Param({
    name: 'dry-run',
    description:
      'If set to true, will simulate the purge but not execute it.',
    required: false,
    type: ParamType.BOOLEAN,
  })
    dryRun = true;
}

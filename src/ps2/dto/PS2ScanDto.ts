import { Param, ParamType } from '@discord-nestjs/core';

export class PS2ScanDto {
  @Param({
    name: 'dry-run',
    description:
      'If set to true, will output the results of the scan to #ps2-scans but not execute.',
    required: false,
    type: ParamType.BOOLEAN,
  })
    dryRun = false;
}

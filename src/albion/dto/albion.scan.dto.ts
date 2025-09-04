import { Choice, Param, ParamType } from '@discord-nestjs/core';
import { AlbionServer } from '../interfaces/albion.api.interfaces';

export class AlbionScanDto {
  @Choice(AlbionServer)
  @Param({
    name: 'server',
    description:
      'Which server to scan for? Americas or Europe?',
    required: true,
  })
    server: AlbionServer;
  @Param({
    name: 'dry-run',
    description:
      'If set to true, will output the results of the scan to #albion-scans but not execute.',
    required: false,
    type: ParamType.BOOLEAN,
  })
    dryRun = false;
}

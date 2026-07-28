import { BooleanOption } from 'necord';

export class AlbionScanDto {
  @BooleanOption({
    name: 'dry-run',
    description:
      'If set to true, will output the results of the scan to #albion-scans but not execute.',
    required: false,
  })
  // Defaulted at the use site — necord ignores field initialisers, see DryRunDto.
  dryRun: boolean;
}

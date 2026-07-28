import { BooleanOption } from 'necord';

export class DryRunDto {
  @BooleanOption({
    name: 'dry-run',
    description:
      'If set to true, will simulate the purge but not execute it.',
    required: false,
  })
  dryRun = true;
}

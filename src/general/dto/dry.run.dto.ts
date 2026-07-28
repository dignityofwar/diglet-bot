import { BooleanOption } from 'necord';

export class DryRunDto {
  @BooleanOption({
    name: 'dry-run',
    description:
      'If set to true, will simulate the purge but not execute it.',
    required: false,
  })
  // No initialiser: necord builds this object literally and never constructs the class, so a
  // field default would be silently ignored. An omitted option arrives as null — default at use.
  dryRun: boolean;
}

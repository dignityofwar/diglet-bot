import { BooleanOption } from 'necord';

export class AlbionSeedRankDatesDto {
  @BooleanOption({
    name: 'dry-run',
    description: 'Report what would be backfilled without writing anything.',
    required: false,
  })
  // Defaulted at the use site — necord ignores field initialisers on option DTOs.
  dryRun: boolean;
}

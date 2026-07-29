import { BooleanOption } from 'necord';

export class AlbionReportsDto {
  @BooleanOption({
    name: 'full-report',
    description:
      'Create a full report of all members.',
    required: false,
  })
  // Defaulted at the use site — necord ignores field initialisers, see DryRunDto.
  fullReport: boolean;
  @BooleanOption({
    name: 'squire-candidates',
    description:
      'Create a list of initiates who are eligible for squire.',
    required: false,
  })
  squireCandidates: boolean;
}

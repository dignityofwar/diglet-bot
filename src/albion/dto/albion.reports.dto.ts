import { BooleanOption } from 'necord';

export class AlbionReportsDto {
  @BooleanOption({
    name: 'full-report',
    description:
      'Create a full report of all members.',
    required: false,
  })
  fullReport = false;
  @BooleanOption({
    name: 'squire-candidates',
    description:
      'Create a list of initiates who are eligible for squire.',
    required: false,
  })
  squireCandidates = false;
}

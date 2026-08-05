import { BooleanOption } from 'necord';

export class OnboardingNudgeDto {
  @BooleanOption({
    name: 'dry-run',
    description: 'Report who would be nudged without posting anything. Defaults to true.',
    required: false,
  })
  // Defaulted at the use site — necord ignores field initialisers on option DTOs.
  dryRun: boolean;

  @BooleanOption({
    name: 'all',
    description: 'Nudge everyone eligible now rather than the usual 5, clearing the backlog in one go.',
    required: false,
  })
  all: boolean;
}

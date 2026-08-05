import { BooleanOption } from 'necord';

export class OnboardingNudgeDto {
  @BooleanOption({
    name: 'dry-run',
    description: 'Report who would be nudged without posting anything. Defaults to true.',
    required: false,
  })
  // Defaulted at the use site — necord ignores field initialisers on option DTOs.
  dryRun: boolean;
}

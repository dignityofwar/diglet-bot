// Pure ballot vocabulary, owned by neither service. Both the publisher and the vote runner need
// these, and the vote runner asks the publisher to re-render a ballot - keeping the shared values
// here is what stops that becoming a circular import.

export const VOTE_APPROVE = '👍';
export const VOTE_SHRUG = '🤷';
export const VOTE_DISAPPROVE = '👎';
export const VOTE_VETO = '⛔';

export const VOTE_REACTIONS = [VOTE_APPROVE, VOTE_SHRUG, VOTE_DISAPPROVE, VOTE_VETO];

// An early result is held this long before it is committed, so an elector who changes their mind
// flips the outcome rather than arriving after it was announced. Does not apply to a timeout,
// which has already had the full voting period.
export const PROVISIONAL_HOLD_MS = 60 * 60 * 1000;

// A majority is strictly more than half. Shrugs are worth 0.5, so half a point is a real
// increment and an even electorate needs half plus 0.5 rather than a whole extra vote:
// 6 voters pass at 3.5, not 4. Odd counts are unchanged - 7 still passes at 4.
export const majorityScore = (electorateSize: number): number => electorateSize / 2 + 0.5;

// Shown from the moment a change is detected, counting down, so a number that is about to move
// looks visibly unsettled rather than silently wrong while the burst finishes
export const RECALCULATING = 'recalculating';

// How often the countdown is repainted. Every tick is a message edit, so a burst costs one edit
// per second of the debounce. Concurrent ballots share Discord's edit budget and discord.js
// queues rather than failing, so the worst case is a countdown that lags, not a lost update.
export const RECALCULATING_TICK_MS = 1000;

// The one definition of the score line, shared with the ballot builder. Kept together with the
// regex in the vote service, which has to match whatever this writes.
export const scoreHeading = (score: number, requiredScore: number, secondsLeft?: number): string => {
  const countdown = secondsLeft === undefined
    ? ''
    : ` *(${RECALCULATING}… ${Math.max(0, Math.ceil(secondsLeft))}s)*`;

  return `## 📊 Current score: ${score} / ${requiredScore}${countdown}`;
};

// How long a claimed but unposted ballot is left alone before it is treated as dead. A send can
// stall far longer than it looks - discord.js queues behind rate limits - so this is a long way
// past a normal post rather than a tight bound. It is not the only guard: trackBallot() writes the
// message ID conditionally, so a publish that loses this race takes its own orphan back down.
export const UNPOSTED_GRACE_MS = 5 * 60 * 1000;

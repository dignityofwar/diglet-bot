/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionRankUpVoteCronService } from './albion.rank.up.vote.cron.service';
import { AlbionRankUpVoteService, PROVISIONAL_HOLD_MS } from './albion.rank.up.vote.service';
import {
  AlbionRankUpVoteEntity,
  AlbionRankUpVoteStatus,
} from '../../database/entities/albion.rank.up.vote.entity';

describe('AlbionRankUpVoteCronService', () => {
  let service: AlbionRankUpVoteCronService;
  let voteRepository: any;
  let voteService: any;

  const makeVote = (overrides: any = {}) => ({
    id: 1,
    status: AlbionRankUpVoteStatus.PENDING,
    score: 2,
    provisionalStatus: null,
    provisionalNote: null,
    provisionalSince: null,
    expiresAt: new Date(Date.now() - 1000),
    resolvedAt: null,
    announcedAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    voteRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    voteService = {
      evaluate: jest.fn().mockResolvedValue(undefined),
      resolve: jest.fn().mockResolvedValue(true),
      announce: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRankUpVoteCronService,
        { provide: AlbionRankUpVoteService, useValue: voteService },
        { provide: getRepositoryToken(AlbionRankUpVoteEntity), useValue: voteRepository },
      ],
    }).compile();

    service = module.get<AlbionRankUpVoteCronService>(AlbionRankUpVoteCronService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reconcileUnannounced', () => {
    // The crash-between-resolving-and-posting case
    it('finishes an outcome that was resolved but never announced', async () => {
      const vote = makeVote({ resolvedAt: new Date(), announcedAt: null });
      voteRepository.find.mockResolvedValueOnce([vote]);

      await service.reconcileUnannounced();

      expect(voteService.announce).toHaveBeenCalledWith(vote);
    });

    it('does nothing when everything has been announced', async () => {
      await service.reconcileUnannounced();

      expect(voteService.announce).not.toHaveBeenCalled();
    });
  });

  describe('commitElapsedHolds', () => {
    it('re-evaluates a hold whose window has passed', async () => {
      const vote = makeVote({
        provisionalStatus: AlbionRankUpVoteStatus.PASSED,
        provisionalSince: new Date(Date.now() - PROVISIONAL_HOLD_MS - 1000),
      });
      voteRepository.find.mockResolvedValueOnce([vote]);

      await service.commitElapsedHolds();

      // Re-tallied rather than trusting the stored result, in case reactions changed
      expect(voteService.evaluate).toHaveBeenCalledWith(vote);
    });

    it('queries only holds older than the window', async () => {
      await service.commitElapsedHolds();

      const query = voteRepository.find.mock.calls[0][0];
      expect(query.status).toBe(AlbionRankUpVoteStatus.PENDING);
      expect(query.provisionalSince.$lte).toBeInstanceOf(Date);
    });
  });

  describe('expireOverdue', () => {
    // Timing out blind would close a vote that had actually passed while the bot was down
    it('recounts before timing out', async () => {
      const vote = makeVote();
      voteRepository.find.mockResolvedValueOnce([vote]);
      voteRepository.findOne.mockResolvedValue(vote);

      await service.expireOverdue();

      expect(voteService.evaluate).toHaveBeenCalledWith(vote);
    });

    it('leaves it alone when the recount already resolved it', async () => {
      const vote = makeVote();
      voteRepository.find.mockResolvedValueOnce([vote]);
      voteRepository.findOne.mockResolvedValue(makeVote({ status: AlbionRankUpVoteStatus.PASSED }));

      await service.expireOverdue();

      expect(voteService.resolve).not.toHaveBeenCalled();
    });

    // Nothing can change its mind after the deadline, so a held result should land as itself
    it('commits a held result instead of reporting a timeout', async () => {
      const vote = makeVote();
      voteRepository.find.mockResolvedValueOnce([vote]);
      voteRepository.findOne.mockResolvedValue(makeVote({
        provisionalStatus: AlbionRankUpVoteStatus.PASSED,
        provisionalNote: null,
        score: 4,
      }));

      await service.expireOverdue();

      expect(voteService.resolve).toHaveBeenCalledWith(
        expect.anything(),
        AlbionRankUpVoteStatus.PASSED,
        4,
        undefined,
      );
    });

    it('times out a vote with nothing held', async () => {
      const vote = makeVote();
      voteRepository.find.mockResolvedValueOnce([vote]);
      voteRepository.findOne.mockResolvedValue(vote);

      await service.expireOverdue();

      expect(voteService.resolve).toHaveBeenCalledWith(
        expect.anything(),
        AlbionRankUpVoteStatus.TIMED_OUT,
        2,
        expect.stringContaining('elapsed'),
      );
    });
  });

  describe('bootstrap', () => {
    it('sweeps on boot so a downtime deadline is not left hanging', async () => {
      const sweep = jest.spyOn(service, 'sweep');

      await service.onApplicationBootstrap();

      expect(sweep).toHaveBeenCalled();
    });

    it('does not stop the bot booting when the sweep fails', async () => {
      jest.spyOn(service, 'sweep').mockRejectedValue(new Error('db down'));

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });
});

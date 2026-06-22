import { describe, expect, it } from 'vitest';
import { CasinoService } from '../casinoService';
import { MemoryTournamentService, TournamentLeaderboardRow, compareRows } from '../tournamentService';

const activeTournament = {
  id: 'test-tournament',
  title: 'Test Tournament',
  description: 'Test scoring window',
  startAt: '2026-06-22T00:00:00.000Z',
  endAt: '2026-06-29T00:00:00.000Z',
  entryFee: 100,
  prizePool: 1000
};

describe('MemoryTournamentService', () => {
  it('enters users idempotently and debits the wallet once through the ledger', async () => {
    const casino = new CasinoService({ user_1: 1000 });
    const service = new MemoryTournamentService(casino, [activeTournament]);

    const first = await service.enter({
      tournamentId: activeTournament.id,
      userId: 'user_1',
      idempotencyKey: 'tournament-entry-1',
      now: new Date('2026-06-23T00:00:00.000Z')
    });
    const duplicate = await service.enter({
      tournamentId: activeTournament.id,
      userId: 'user_1',
      idempotencyKey: 'tournament-entry-duplicate',
      now: new Date('2026-06-23T00:00:00.000Z')
    });

    expect(first.wallet.available).toBe(900);
    expect(duplicate.wallet.available).toBe(900);
    expect(duplicate.entry.id).toBe(first.entry.id);
    expect(casino.getLedger('user_1')).toHaveLength(1);
    expect(casino.getLedger('user_1')[0]).toMatchObject({
      type: 'debit',
      amount: 100,
      metadata: {
        source: 'tournament_entry',
        tournamentId: activeTournament.id
      }
    });
  });

  it('scores only settled backend rounds inside the tournament window', async () => {
    const casino = new CasinoService({ user_1: 1000 });
    const service = new MemoryTournamentService(casino, [activeTournament]);
    await service.enter({
      tournamentId: activeTournament.id,
      userId: 'user_1',
      idempotencyKey: 'tournament-entry-1',
      now: new Date('2026-06-23T00:00:00.000Z')
    });
    casino.placeBet({ userId: 'user_1', gameId: 'roulette', stake: 100, idempotencyKey: 'open-round' });
    const settled = casino.placeBet({ userId: 'user_1', gameId: 'roulette', stake: 200, idempotencyKey: 'settled-round' });
    casino.settleRound({ roundId: settled.id, payout: 260, idempotencyKey: 'settled-round-payout' });

    const leaderboard = await service.leaderboard({
      tournamentId: activeTournament.id,
      now: new Date('2026-06-23T00:00:00.000Z')
    });

    expect(leaderboard.entries).toHaveLength(1);
    expect(leaderboard.entries[0]).toMatchObject({
      rank: 1,
      userId: 'user_1',
      score: 60,
      totalStake: 200,
      totalPayout: 260,
      roundCount: 1
    });
  });

  it('applies deterministic leaderboard tie-breaks', () => {
    const rows: Array<Omit<TournamentLeaderboardRow, 'rank'>> = [
      row('user_b', 50, 200, 3, '2026-06-23T12:05:00.000Z'),
      row('user_a', 50, 250, 1, '2026-06-23T12:10:00.000Z'),
      row('user_c', 50, 250, 2, '2026-06-23T12:10:00.000Z'),
      row('user_d', 40, 500, 9, '2026-06-23T12:00:00.000Z')
    ];

    expect(rows.sort(compareRows).map(item => item.userId)).toEqual(['user_c', 'user_a', 'user_b', 'user_d']);
  });
});

const row = (
  userId: string,
  score: number,
  totalPayout: number,
  roundCount: number,
  lastSettledAt: string
): Omit<TournamentLeaderboardRow, 'rank'> => ({
  userId,
  score,
  totalStake: totalPayout - score,
  totalPayout,
  roundCount,
  lastSettledAt
});

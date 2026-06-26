import { describe, expect, it } from 'vitest';
import { asMoney } from '../../domain/money';
import { CasinoService } from '../casinoService';
import { MemoryTournamentService, TournamentLeaderboardRow, buildLeaderboardRow, compareRows } from '../tournamentService';

const activeTournament = {
  id: 'test-tournament',
  title: 'Test Tournament',
  description: 'Test scoring window',
  startAt: '2026-06-22T00:00:00.000Z',
  endAt: '2026-06-29T00:00:00.000Z',
  entryFee: 100,
  prizePool: 1000
};

const settlingTournament = {
  id: 'settling-tournament',
  title: 'Settling Tournament',
  description: 'Settlement window',
  startAt: '2020-01-01T00:00:00.000Z',
  endAt: '2099-01-01T00:00:00.000Z',
  entryFee: 0,
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
      now: new Date('2026-06-22T00:00:00.000Z')
    });
    const duplicate = await service.enter({
      tournamentId: activeTournament.id,
      userId: 'user_1',
      idempotencyKey: 'tournament-entry-duplicate',
      now: new Date('2026-06-22T00:00:00.000Z')
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
      now: new Date('2026-06-22T00:00:00.000Z')
    });
    casino.placeBet({ userId: 'user_1', gameId: 'roulette', stake: 100, idempotencyKey: 'open-round' });
    const settled = casino.placeBet({ userId: 'user_1', gameId: 'roulette', stake: 200, idempotencyKey: 'settled-round' });
    casino.settleRound({ roundId: settled.id, payout: 260, idempotencyKey: 'settled-round-payout' });

    const leaderboard = await service.leaderboard({
      tournamentId: activeTournament.id,
      now: new Date('2026-06-22T00:00:00.000Z')
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

  it('rejects entry before the tournament starts', async () => {
    const casino = new CasinoService({ user_1: 1000 });
    const service = new MemoryTournamentService(casino, [activeTournament]);

    await expect(service.enter({
      tournamentId: activeTournament.id,
      userId: 'user_1',
      idempotencyKey: 'tournament-entry-upcoming',
      now: new Date('2026-06-21T23:59:59.000Z')
    })).rejects.toThrow('not open for entry');
    expect(casino.getWallet('user_1').available).toBe(1000);
  });

  it('does not score rounds settled before the user entered', () => {
    const row = buildLeaderboardRow(
      {
        userId: 'user_1',
        enteredAt: '2026-06-23T00:00:00.000Z'
      },
      activeTournament,
      [
        {
          id: 'round_before',
          userId: 'user_1',
          gameId: 'roulette',
          stake: asMoney(100),
          status: 'settled',
          payout: asMoney(500),
          lockIdempotencyKey: 'before-bet',
          settlementIdempotencyKey: 'before-settle',
          createdAt: '2026-06-22T10:00:00.000Z',
          settledAt: '2026-06-22T10:01:00.000Z'
        },
        {
          id: 'round_after',
          userId: 'user_1',
          gameId: 'roulette',
          stake: asMoney(200),
          status: 'settled',
          payout: asMoney(260),
          lockIdempotencyKey: 'after-bet',
          settlementIdempotencyKey: 'after-settle',
          createdAt: '2026-06-23T10:00:00.000Z',
          settledAt: '2026-06-23T10:01:00.000Z'
        }
      ]
    );

    expect(row).toMatchObject({
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

  it('rejects settlement before the tournament has ended', async () => {
    const casino = new CasinoService({ user_1: 1000 });
    const service = new MemoryTournamentService(casino, [settlingTournament]);

    await service.enter({
      tournamentId: settlingTournament.id,
      userId: 'user_1',
      idempotencyKey: 'settle-entry-1',
      now: new Date('2026-06-22T12:00:00.000Z')
    });

    await expect(service.settle({
      tournamentId: settlingTournament.id,
      idempotencyKey: 'settle-too-early',
      now: new Date('2026-06-22T12:30:00.000Z')
    })).rejects.toThrow('not ready for settlement');
  });

  it('settles ended tournaments with prize ledger credits exactly once', async () => {
    const casino = new CasinoService({ user_1: 1000, user_2: 1000, user_3: 1000 });
    const service = new MemoryTournamentService(casino, [settlingTournament]);
    for (const userId of ['user_1', 'user_2', 'user_3']) {
      await service.enter({
        tournamentId: settlingTournament.id,
        userId,
        idempotencyKey: `entry-${userId}`,
        now: new Date('2026-06-22T00:00:00.000Z')
      });
    }
    settleCasinoRound(casino, 'user_1', 100, 200);
    settleCasinoRound(casino, 'user_2', 100, 150);
    settleCasinoRound(casino, 'user_3', 100, 0);

    const first = await service.settle({
      tournamentId: settlingTournament.id,
      idempotencyKey: 'settle-prizes',
      now: new Date('2099-01-01T00:00:01.000Z')
    });
    const duplicate = await service.settle({
      tournamentId: settlingTournament.id,
      idempotencyKey: 'settle-prizes-duplicate',
      now: new Date('2099-01-01T00:00:01.000Z')
    });

    expect(first.payouts.map(payout => [payout.userId, payout.rank, payout.amount])).toEqual([
      ['user_1', 1, 500],
      ['user_2', 2, 300],
      ['user_3', 3, 200]
    ]);
    expect(duplicate.id).toBe(first.id);
    expect(casino.getWallet('user_1').available).toBe(1600);
    expect(casino.getWallet('user_2').available).toBe(1350);
    expect(casino.getWallet('user_3').available).toBe(1100);
    expect(casino.getLedger('user_1').filter(entry => entry.metadata?.source === 'tournament_prize')).toHaveLength(1);
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

const settleCasinoRound = (casino: CasinoService, userId: string, stake: number, payout: number) => {
  const round = casino.placeBet({
    userId,
    gameId: 'roulette',
    stake,
    idempotencyKey: `bet-${userId}-${stake}-${payout}`
  });
  casino.settleRound({
    roundId: round.id,
    payout,
    idempotencyKey: `settle-${userId}-${stake}-${payout}`
  });
};

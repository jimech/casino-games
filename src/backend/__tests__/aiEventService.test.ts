import { describe, expect, it } from 'vitest';
import { MemoryAiEventService } from '../aiEventService';

describe('ai event service', () => {
  it('tracks structured events newest first', () => {
    const service = new MemoryAiEventService();

    service.track({
      userId: 'user_1',
      category: 'page',
      name: 'tab_viewed',
      context: { tab: 'home' }
    });
    service.track({
      userId: 'user_1',
      category: 'game',
      name: 'round_started',
      context: { gameId: 'roulette', stake: 100 }
    });

    const events = service.list({ userId: 'user_1' });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      userId: 'user_1',
      category: 'game',
      name: 'round_started',
      context: { gameId: 'roulette', stake: 100 }
    });
    expect(events[0].createdAt).toEqual(expect.any(String));
  });

  it('filters by category and time range', () => {
    const service = new MemoryAiEventService();
    const before = new Date(Date.now() - 1000).toISOString();

    service.track({ userId: 'user_1', category: 'bonus', name: 'bonus_claimed' });
    service.track({ userId: 'user_1', category: 'page', name: 'tab_viewed' });

    const bonusEvents = service.list({ userId: 'user_1', category: 'bonus', since: before });

    expect(bonusEvents).toHaveLength(1);
    expect(bonusEvents[0].name).toBe('bonus_claimed');
  });

  it('validates required event fields', () => {
    const service = new MemoryAiEventService();

    expect(() => service.track({
      userId: '',
      category: 'page',
      name: 'tab_viewed'
    })).toThrow(/userId is required/);
    expect(() => service.track({
      userId: 'user_1',
      category: 'wrong' as 'page',
      name: 'tab_viewed'
    })).toThrow(/category is invalid/);
  });
});

import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, Compass, Play, Coins, UserCheck, User, Gift, Award, CreditCard,
  BookOpen, HeartHandshake, Settings as SettingsIcon, LogOut, ShieldCheck, Bell, Activity
} from 'lucide-react';

import SlotsGame from './components/SlotsGame';
import BlackjackGame from './components/BlackjackGame';
import RouletteGame from './components/RouletteGame';
import PokerGame from './components/PokerGame';
import CrashGame from './components/CrashGame';
import { sound } from './utils/audio';
import { UserProfile, GameCatalogItem, BlogPost } from './types';
import {
  AuthSessionDto,
  AdminSummaryDto,
  actBlackjackRound,
  actPokerRound,
  cashoutCrashRound,
  claimBonus,
  createNotification,
  createWalletEventSource,
  fetchAuthSession,
  fetchAdminSummary,
  fetchGameRecommendations,
  fetchNotifications,
  fetchTargetedBonuses,
  fetchWallet,
  GameRecommendationDto,
  getStoredAuthToken,
  loginAccount,
  logoutAccount,
  markNotificationRead,
  NotificationDto,
  placeBet,
  registerAccount,
  ResponsiblePlayInterventionDto,
  settleRound,
  spinSlots,
  spinRoulette,
  startBlackjackRound,
  startCrashRound,
  startPokerRound,
  TargetedBonusOfferDto,
  trackAiEvent
} from './api/casinoApi';

// Complete 20-Game Catalog Pre-designed nodes
const GAME_CATALOG_DATA: GameCatalogItem[] = [
  { id: 'fruit-mania', title: 'Neon Fruit Mania', category: 'slots', provider: 'Spinfuego', rtp: '96.5%', volatility: 'Low', img: '🍋', description: 'Retro citrus action with a modern cyberpunk jackpot spinner.', winOdds: '1 in 3.4' },
  { id: 'cyber-jackpot', title: 'Cyber Jackpot 2077', category: 'slots', provider: 'HackerGames', rtp: '95.0%', volatility: 'High', img: '⚡', description: 'Enter the grid of servers to decrypt locked scatters.', winOdds: '1 in 4.8' },
  { id: 'ancient-gold', title: "Pharaoh's Neon Gold", category: 'slots', provider: 'GizaBits', rtp: '97.2%', volatility: 'Medium', img: '🏺', description: 'Acquire old golden sarcophagus multipliers in neon amber sands.', winOdds: '1 in 3.1' },
  { id: 'cherry-rush', title: 'Cherry Fusion Blast', category: 'slots', provider: 'Spinfuego', rtp: '98.1%', volatility: 'Low', img: '🍒', description: 'High frequency payouts with juicy multiplier explosions.', winOdds: '1 in 2.9' },
  { id: 'laser-lines', title: 'Laser Lines Wild', category: 'slots', provider: 'NexusStudio', rtp: '94.2%', volatility: 'Extreme', img: '🌀', description: 'High multiplier, high volatility. Big hits or immediate blanks.', winOdds: '1 in 6.1' },
  { id: 'bj-standard', title: 'Blackjack Vegas Pro', category: 'blackjack', provider: 'Evolutionary', rtp: '99.5%', volatility: 'Medium', img: '🃏', description: 'Vegas standard felt with card counting tracker utilities.', winOdds: '1 in 2.1' },
  { id: 'bj-vip', title: 'Diamond VIP Blackjack', category: 'blackjack', provider: 'Evolutionary', rtp: '99.7%', volatility: 'Low', img: '💎', description: 'Private high table. Unlimited splits, late surrender rules.', winOdds: '1 in 1.9' },
  { id: 'roulette-euro', title: 'European Neon Wheel', category: 'roulette', provider: 'RND Labs', rtp: '97.3%', volatility: 'Medium', img: '🎡', description: 'European wheel table layout. Single zero edge advantage.', winOdds: '1 in 3.2' },
  { id: 'roulette-royal', title: 'Roulette Royale', category: 'roulette', provider: 'GizaBits', rtp: '97.3%', volatility: 'High', img: '👑', description: 'Premium table with integrated outcome history visual charts.', winOdds: '1 in 3.5' },
  { id: 'poker-holdem', title: "Hold'em Tournament AI", category: 'poker', provider: 'DealerPro', rtp: '98.9%', volatility: 'High', img: '🏆', description: 'Texas holdem card arena with computer neural bots.', winOdds: '1 in 4.0' },
  { id: 'poker-omaha', title: 'Omaha Limit Pro', category: 'poker', provider: 'DealerPro', rtp: '97.8%', volatility: 'Medium', img: '🎭', description: '4-hole card omaha rules with automated payout calculations.', winOdds: '1 in 3.8' },
  { id: 'crash-cosmic', title: 'Cosmic Flight Rocket', category: 'crash', provider: 'NexusStudio', rtp: '96.2%', volatility: 'Extreme', img: '🚀', description: 'Lock multipliers in mid-air. Fast cash out limits.', winOdds: '1 in 2.5' },
  { id: 'crash-zeus', title: "Zeus Thunderbolt", category: 'crash', provider: 'Athenian', rtp: '96.8%', volatility: 'High', img: '🌩️', description: 'Multiplier climbs as Zeus constructs visual thunderbolt arcs.', winOdds: '1 in 2.7' },
  { id: 'live-dealer-bj', title: 'Live Emerald Dealer BJ', category: 'live', provider: 'VegasStream', rtp: '99.5%', volatility: 'Medium', img: '👩‍💼', description: 'Simulated real-time dealer with online multiplayer chat.', winOdds: '1 in 2.0' },
  { id: 'live-dealer-rt', title: 'Live Sunset Casino Wheel', category: 'live', provider: 'VegasStream', rtp: '97.3%', volatility: 'High', img: '🔴', description: 'Direct physical spin telemetry broadcasted globally.', winOdds: '1 in 3.0' },
  { id: 'live-dealer-pk', title: 'Live Holdem Champions', category: 'live', provider: 'VegasStream', rtp: '98.9%', volatility: 'High', img: '🤵', description: 'Real poker tables streamed live. Play with international players.', winOdds: '1 in 4.5' },
  { id: 'slots-cyber-reels', title: 'Retro Byte Reels', category: 'slots', provider: 'RetroCade', rtp: '96.0%', volatility: 'Low', img: '👾', description: 'Chiptune audio score slots with 8-bit retro symbol cards.', winOdds: '1 in 3.5' },
  { id: 'slots-volcano', title: 'Neon Volcanic Hot', category: 'slots', provider: 'Spinfuego', rtp: '95.5%', volatility: 'High', img: '🌋', description: 'Flowing lava columns construct scatters for free re-spins.', winOdds: '1 in 4.2' },
  { id: 'slots-aztec', title: 'Aztec Laser Pyramid', category: 'slots', provider: 'GizaBits', rtp: '96.6%', volatility: 'Medium', img: '🗿', description: 'Unlock neon stone tablets for cascading mystery prizes.', winOdds: '1 in 3.8' },
  { id: 'slots-neon-777', title: 'Classic Wild Triple 7s', category: 'slots', provider: 'NexusStudio', rtp: '97.5%', volatility: 'Low', img: '🎰', description: 'Traditional physical three-reel slots layout styled in glow paint.', winOdds: '1 in 3.0' }
];

// Blog Posts
const BLOG_DATA: BlogPost[] = [
  { id: 'b1', title: 'Understanding Slot RTP Percentages', category: 'Strategy', summary: 'Learn how Return to Player dynamics and machine volatility dictate payout cycles over extended sessions.', content: 'Return to Player (RTP) is the statistical average percentage a gaming machine repays to users over millions of spins. Low volatility provides frequent minor hits ideal for testing strategies, whereas High volatility features rare but monumental multipliers. Complying with regulatory RNG, our Neon suite simulates natural mathematical curves to ensure transparent payouts.', date: '2026-06-12', author: 'Clemens Vegas' },
  { id: 'b2', title: 'Hi-Lo Blackjack Card Counting Mechanics', category: 'Guide', summary: 'A comprehensive study on standard card shoe probabilities and utilizing the live count HUD to optimize betting.', content: 'Card counting is built on statistical weight ratios of high cards to low cards. High cards (10, Faces, Aces) benefit players by facilitating natural Blackjacks and breaking dealer bust bounds. By using our integrated Hi-Lo HUD display, you can visually observe how mathematical probability shifts with each deck drawn.', date: '2026-06-14', author: 'Count Professor' },
  { id: 'b3', title: 'A Beginners Guide to Texas Holdem Betting Stances', category: 'Poker', summary: 'Master the core mathematical values behind folds, checks, raises, and reading computer dealer AI behavior.', content: 'Success in Texas Holdem relies on reading standard board structures and calculating matching pot ratios. Understanding when to Fold prevents unnecessary loss of high stakes, while Check and Raise structures allow maximizing chips size when holding powerful pairs or straight flushes.', date: '2026-06-15', author: 'Pharaoh Cardman' }
];

export default function App() {
  // Navigation State
  const [activeCasinoTab, setActiveCasinoTab] = useState<string>('home'); // home, games, profile, bonuses, vip, live, support, blog, settings, wallet

  // Interactive Live App Global State
  const [user, setUser] = useState<UserProfile>({
    username: 'NeonGambler18',
    avatar: '🎰',
    vipTier: 'Gold',
    walletBalance: 250,
    isVip: true,
    totalSpins: 42,
    totalBlackjackWins: 18,
    totalRouletteWins: 9,
    totalPokerWins: 12,
    totalCrashWins: 5,
    biggestWin: 350,
    joinedDate: '2026-05-10',
    dailyStreak: 3,
    lastDailyClaim: null,
    freeSpinsLeft: 50
  });

  // Support State
  const [supportForm, setSupportForm] = useState({ name: '', email: '', message: '' });
  const [supportSubmitted, setSupportSubmitted] = useState(false);

  // General States
  const [pushNotification, setPushNotification] = useState<{ msg: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [gdprChecked, setGdprChecked] = useState(true);
  const [sessionTimeoutInput, setSessionTimeoutInput] = useState('30 mins');
  const [registeredAgeChecked, setRegisteredAgeChecked] = useState(true);

  // Filters state for Game Catalog Screen
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterVolatility, setFilterVolatility] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [authSession, setAuthSession] = useState<AuthSessionDto | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [adminSummary, setAdminSummary] = useState<AdminSummaryDto | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [gameRecommendations, setGameRecommendations] = useState<GameRecommendationDto[]>([]);
  const [targetedBonuses, setTargetedBonuses] = useState<TargetedBonusOfferDto[]>([]);
  const [authForm, setAuthForm] = useState({
    username: 'neon_private',
    email: '',
    password: '',
    displayName: 'Neon Private',
    dateOfBirth: '',
    adminInviteCode: '',
    acceptAgeGate: false,
    acceptTerms: false,
    acceptPrivacy: false
  });
  const pendingRoundsRef = useRef<Record<string, string[]>>({});
  const activeUserId = authSession?.user.id ?? '';

  // Floating notifications
  const triggerNotification = (message: string, type: 'success' | 'info' | 'error') => {
    setPushNotification({ msg: message, type });
    setTimeout(() => {
      setPushNotification(null);
    }, 4000);
  };

  const notifyResponsiblePlay = (intervention?: ResponsiblePlayInterventionDto) => {
    if (!intervention || intervention.level === 'none') return;
    triggerNotification(intervention.message, intervention.level === 'cooldown' ? 'error' : 'info');
  };

  useEffect(() => {
    void restoreAuthSession();
  }, []);

  useEffect(() => {
    if (authSession) void syncWalletFromBackend();
  }, [authSession?.user.id]);

  useEffect(() => {
    if (authSession) void loadNotifications();
  }, [authSession?.user.id]);

  useEffect(() => {
    if (authSession) void loadTargetedBonuses();
  }, [authSession?.user.id]);

  useEffect(() => {
    if (authSession) void loadGameRecommendations();
  }, [authSession?.user.id]);

  useEffect(() => {
    if (authSession && activeCasinoTab === 'admin') void loadAdminSummary();
  }, [authSession?.user.id, activeCasinoTab]);

  useEffect(() => {
    if (!authSession) return;
    void recordUiEvent('page', 'tab_viewed', { tab: activeCasinoTab });
  }, [authSession?.user.id, activeCasinoTab]);

  useEffect(() => {
    if (!authSession) return;
    const events = createWalletEventSource(authSession.user.id);
    events.addEventListener('wallet', event => {
      const payload = JSON.parse((event as MessageEvent).data) as { available: number; locked: number };
      setUser(prev => ({ ...prev, walletBalance: payload.available }));
    });
    events.onerror = () => {
      console.warn('Wallet realtime stream disconnected');
    };
    return () => {
      events.close();
    };
  }, [authSession?.user.id]);

  const restoreAuthSession = async () => {
    try {
      if (!getStoredAuthToken()) {
        setAuthLoading(false);
        return;
      }
      const session = await fetchAuthSession();
      setAuthSession(session);
      setUser(prev => ({
        ...prev,
        username: session.user.displayName ?? session.user.username,
        joinedDate: session.user.createdAt.slice(0, 10)
      }));
    } catch (error) {
      console.warn('Session restore failed', error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthSubmitting(true);
    try {
      const session = authMode === 'register'
        ? await registerAccount({
            username: authForm.username,
            email: authForm.email || undefined,
            password: authForm.password,
            displayName: authForm.displayName,
            dateOfBirth: authForm.dateOfBirth || undefined,
            acceptAgeGate: authForm.acceptAgeGate,
            acceptTerms: authForm.acceptTerms,
            acceptPrivacy: authForm.acceptPrivacy,
            adminInviteCode: authForm.adminInviteCode || undefined
          })
        : await loginAccount({
            login: authForm.username,
            password: authForm.password
          });
      setAuthSession(session);
      setUser(prev => ({
        ...prev,
        username: session.user.displayName ?? session.user.username,
        joinedDate: session.user.createdAt.slice(0, 10)
      }));
      triggerNotification(authMode === 'register' ? 'Private account created. Session is active.' : 'Session restored. Welcome back.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      triggerNotification(message, 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    sound.playClick();
    await logoutAccount();
    setAuthSession(null);
    setActiveCasinoTab('home');
    triggerNotification('Logged out of the private casino session.', 'info');
  };

  const loadAdminSummary = async () => {
    setAdminLoading(true);
    try {
      setAdminSummary(await fetchAdminSummary());
    } catch (error) {
      triggerNotification(error instanceof Error ? error.message : "Admin summary failed to load.", "error");
    } finally {
      setAdminLoading(false);
    }
  };

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      setNotifications(await fetchNotifications({ limit: 50 }));
    } catch (error) {
      console.warn('Notification load failed', error);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const loadGameRecommendations = async () => {
    try {
      const result = await fetchGameRecommendations({ limit: 20 });
      setGameRecommendations(result.recommendations);
    } catch (error) {
      console.warn('Game recommendations failed', error);
      setGameRecommendations([]);
    }
  };

  const loadTargetedBonuses = async () => {
    try {
      const result = await fetchTargetedBonuses();
      setTargetedBonuses(result.offers);
    } catch (error) {
      console.warn('Targeted bonuses failed', error);
      setTargetedBonuses([]);
    }
  };

  const markInboxItemRead = async (notificationId: string) => {
    try {
      const updated = await markNotificationRead(notificationId);
      setNotifications(prev => prev.map(item => item.id === updated.id ? updated : item));
    } catch (error) {
      triggerNotification(error instanceof Error ? error.message : "Notification update failed.", "error");
    }
  };

  const recordUiEvent = async (
    category: 'page' | 'game' | 'wallet' | 'bonus' | 'risk' | 'admin' | 'session',
    name: string,
    context?: Record<string, unknown>
  ) => {
    if (!authSession) return;
    try {
      await trackAiEvent({ category, name, context });
    } catch (error) {
      console.warn('AI event capture failed', error);
    }
  };

  const launchGameFromLobby = (game: { id: string; title: string; category?: string; provider?: string; rtp?: string }) => {
    sound.playClick();
    const route = game.category === 'live'
      ? 'live'
      : game.category === 'slots' || game.id === 'slots'
        ? 'slots'
        : game.category ?? game.id;
    void recordUiEvent('game', 'game_clicked', {
      gameId: game.id,
      title: game.title,
      provider: game.provider,
      rtp: game.rtp,
      route
    });
    setActiveCasinoTab(route);
    void loadGameRecommendations();
  };

  const syncWalletFromBackend = async () => {
    if (!activeUserId) return;
    try {
      const wallet = await fetchWallet(activeUserId);
      setUser(prev => ({ ...prev, walletBalance: wallet.available }));
    } catch (error) {
      console.warn('Wallet sync failed', error);
      triggerNotification("Backend wallet sync failed. Using local wallet state for now.", "error");
    }
  };

  const applyLocalWalletDelta = (amount: number) => {
    setUser(prev => {
      const isWin = amount > 0;
      let nextBiggest = prev.biggestWin;
      if (isWin && amount > prev.biggestWin) {
        nextBiggest = amount;
      }
      return {
        ...prev,
        walletBalance: Math.max(0, prev.walletBalance + amount),
        biggestWin: nextBiggest,
        totalSpins: prev.totalSpins + (isWin ? 0 : 1)
      };
    });
  };

  // Helper inside wallet and games. Game calls are mirrored to backend settlement APIs.
  const handleUpdateWallet = (amount: number, gameId = 'local') => {
    applyLocalWalletDelta(amount);

    if (gameId === 'local' || amount === 0) return;

    void syncGameWalletMutation(amount, gameId);
  };

  const syncGameWalletMutation = async (amount: number, gameId: string) => {
    try {
      if (amount < 0) {
        const response = await placeBet({
          userId: activeUserId,
          gameId,
          stake: Math.abs(amount),
          idempotencyKey: `${gameId}-bet-${crypto.randomUUID()}`
        });
        pendingRoundsRef.current[gameId] = [
          ...(pendingRoundsRef.current[gameId] ?? []),
          response.round.id
        ];
        notifyResponsiblePlay(response.responsiblePlayIntervention);
        setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
        return;
      }

      const [roundId, ...remaining] = pendingRoundsRef.current[gameId] ?? [];
      pendingRoundsRef.current[gameId] = remaining;

      if (!roundId) {
        return;
      }

      const response = await settleRound({
        roundId,
        payout: amount,
        idempotencyKey: `${gameId}-settle-${roundId}-${crypto.randomUUID()}`,
        outcome: { source: 'frontend-game' }
      });
      setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
    } catch (error) {
      console.error('Backend settlement sync failed', error);
      triggerNotification("Backend settlement sync failed. Refreshing wallet from database.", "error");
      await syncWalletFromBackend();
    }
  };

  const resolveRouletteSpin = async (bets: Parameters<typeof spinRoulette>[0]['bets']) => {
    const response = await spinRoulette({
      userId: activeUserId,
      bets,
      idempotencyKey: `roulette-spin-${crypto.randomUUID()}`
    });
    notifyResponsiblePlay(response.responsiblePlayIntervention);
    setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
    return {
      outcome: response.outcome,
      stake: response.stake,
      payout: response.payout
    };
  };

  const startCrashGameRound = async (stake: number) => {
    const response = await startCrashRound({
      userId: activeUserId,
      stake,
      idempotencyKey: `crash-start-${crypto.randomUUID()}`
    });
    notifyResponsiblePlay(response.responsiblePlayIntervention);
    setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
    return {
      roundId: response.round.id,
      crashPoint: response.crashPoint,
      walletAvailable: response.wallet.available
    };
  };

  const cashoutCrashGameRound = async (roundId: string, cashoutMultiplier: number) => {
    const response = await cashoutCrashRound({
      roundId,
      cashoutMultiplier,
      idempotencyKey: `crash-cashout-${roundId}-${crypto.randomUUID()}`
    });
    setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
    return {
      payout: response.payout,
      cashoutMultiplier: response.cashoutMultiplier,
      walletAvailable: response.wallet.available
    };
  };

  const spinSlotsGameRound = async (input: Parameters<typeof spinSlots>[0]) => {
    const response = await spinSlots({
      ...input,
      userId: activeUserId,
      idempotencyKey: `slots-spin-${crypto.randomUUID()}`
    });
    notifyResponsiblePlay(response.responsiblePlayIntervention);
    setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
    return {
      displaySymbols: response.outcome.displaySymbols,
      payout: response.outcome.payout,
      bonusSpinsAwarded: response.outcome.bonusSpinsAwarded,
      walletAvailable: response.wallet.available
    };
  };

  const startBlackjackGameRound = async (stake: number) => {
    const response = await startBlackjackRound({
      userId: activeUserId,
      stake,
      idempotencyKey: `blackjack-start-${crypto.randomUUID()}`
    });
    notifyResponsiblePlay(response.responsiblePlayIntervention);
    setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
    return response.view;
  };

  const actBlackjackGameRound = async (roundId: string, action: 'hit' | 'stand' | 'double' | 'split') => {
    const response = await actBlackjackRound({
      roundId,
      action,
      idempotencyKey: `blackjack-${action}-${roundId}-${crypto.randomUUID()}`
    });
    setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
    return response.view;
  };

  const startPokerGameRound = async (ante: number) => {
    const response = await startPokerRound({
      userId: activeUserId,
      ante,
      idempotencyKey: `poker-start-${crypto.randomUUID()}`
    });
    notifyResponsiblePlay(response.responsiblePlayIntervention);
    setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
    return response.view;
  };

  const actPokerGameRound = async (roundId: string, action: 'check' | 'call' | 'raise' | 'fold') => {
    const response = await actPokerRound({
      roundId,
      action,
      idempotencyKey: `poker-${action}-${roundId}-${crypto.randomUUID()}`
    });
    setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
    return response.view;
  };

  // Fast auto sync standard payouts for games loading inside specific frames
  const claimDailySpins = async () => {
    sound.playClick();
    try {
      const response = await claimBonus({
        campaignId: 'daily-free-credits-100',
        idempotencyKey: `bonus-daily-${activeUserId}-${new Date().toISOString().slice(0, 10)}`
      });
      setUser(prev => ({ ...prev, freeSpinsLeft: 0, walletBalance: response.wallet.available, lastDailyClaim: response.claim.createdAt }));
      await loadNotifications();
      await loadTargetedBonuses();
      sound.playBigWin();
      triggerNotification(`Daily bonus claimed: +$${response.claim.amount}`, "success");
    } catch (error) {
      sound.playError();
      triggerNotification(error instanceof Error ? error.message : "Daily bonus claim failed.", "error");
    }
  };

  const handleClaimWelcomeMatch = async () => {
    sound.playClick();
    try {
      const response = await claimBonus({
        campaignId: 'welcome-match-500',
        idempotencyKey: `bonus-welcome-${activeUserId}`
      });
      setUser(prev => ({ ...prev, walletBalance: response.wallet.available }));
      await loadNotifications();
      await loadTargetedBonuses();
      sound.playBigWin();
      triggerNotification(`Welcome bonus credited: +$${response.claim.amount}`, "success");
    } catch (error) {
      sound.playError();
      triggerNotification(error instanceof Error ? error.message : "Welcome bonus claim failed.", "error");
    }
  };

  const claimTargetedBonus = async (offer: TargetedBonusOfferDto) => {
    if (offer.campaignId === 'welcome-match-500') {
      await handleClaimWelcomeMatch();
      return;
    }
    if (offer.campaignId === 'daily-free-credits-100') {
      await claimDailySpins();
      return;
    }
    triggerNotification(`Targeted offer unavailable: ${offer.title}`, 'error');
  };

  // Support Validation Handler
  const handleSupportFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    if (!supportForm.name || !supportForm.email || !supportForm.message) {
      sound.playError();
      triggerNotification("Please fill out all support inputs before submitting!", "error");
      return;
    }
    await createNotification({
      type: 'support',
      title: 'Support request received',
      message: supportForm.message.slice(0, 240),
      metadata: {
        name: supportForm.name,
        email: supportForm.email
      }
    });
    await loadNotifications();
    setSupportSubmitted(true);
    triggerNotification("Message dispatched. Support agent response generated immediately!", "success");
  };

  // Filter components variables
  const recommendationRank = new Map<string, GameRecommendationDto>(gameRecommendations.map(item => [item.gameId, item]));
  const filteredGames = GAME_CATALOG_DATA.filter(g => {
    const matchesCategory = filterCategory === 'all' || g.category === filterCategory;
    const matchesVolatility = filterVolatility === 'all' || g.volatility === filterVolatility;
    const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          g.provider.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesVolatility && matchesSearch;
  }).sort((left, right) => {
    const leftRank = recommendationRank.get(left.id)?.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = recommendationRank.get(right.id)?.rank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.title.localeCompare(right.title);
  });

  return (
    <div className="min-h-screen bg-[#0B0B14] text-neutral-100 flex flex-col font-sans select-none antialiased overflow-x-hidden">

      {/* FIXED PUSH NOTIFICATIONS */}
      {pushNotification && (
        <div className="fixed top-5 right-5 z-50 animate-bounce max-w-sm bg-neutral-900 border-l-4 border-l-[#00FF88] p-4 rounded-lg shadow-2xl flex items-center gap-3">
          <div className="text-xl">🏆</div>
          <div>
            <div className="text-[10px] uppercase font-bold text-neutral-400">Las Vegas Casino Alert</div>
            <div className="text-xs text-neutral-200 mt-0.5">{pushNotification.msg}</div>
          </div>
          <button onClick={() => setPushNotification(null)} className="text-xs text-neutral-500 hover:text-white ml-2">✕</button>
        </div>
      )}

      {authLoading && (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0B14] text-neutral-300">
          <div className="text-xs uppercase tracking-widest font-black">Loading private session...</div>
        </div>
      )}

      {!authLoading && !authSession && (
        <AuthGate
          mode={authMode}
          setMode={setAuthMode}
          form={authForm}
          setForm={setAuthForm}
          submitting={authSubmitting}
          onSubmit={handleAuthSubmit}
        />
      )}

      {!authLoading && authSession && (
      <>

      {/* DECORATIVE CONTROL HEADER */}
      <header className="bg-neutral-950 border-b border-neutral-850 px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4 z-40 relative">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-gradient-to-tr from-[#FF0055] to-purple-600 rounded-xl flex items-center justify-center text-xl font-bold font-mono text-white shadow-lg animate-pulse">
            V
          </div>
          <div>
            <h1 className="text-sm md:text-md font-black uppercase tracking-wider text-[#FF0055] flex items-center gap-1.5">
              VEGAS NEON ARENA
              <span className="bg-gradient-to-r from-[#00FF88] to-emerald-500 text-[8px] font-black text-black px-2 py-0.5 rounded-full uppercase tracking-widest leading-none">
                Live Simulation
              </span>
            </h1>
            <p className="text-[10px] text-neutral-450 font-mono mt-0.5">Certified fair RNG iGaming Experience</p>
          </div>
        </div>

        {/* MOCK WALLET PREVIEW */}
        <div className="flex items-center gap-3">
          <div className="bg-neutral-900 border border-neutral-830 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <Coins className="h-4 w-4 text-yellow-400 animate-spin" />
            <div>
              <div className="text-[8px] text-neutral-500 uppercase font-black tracking-wider block">Wallet Balance</div>
              <span className="text-xs font-mono font-black text-yellow-400 block">${user.walletBalance}</span>
            </div>
          </div>
          <button
            onClick={() => {
              sound.playClick();
              setActiveCasinoTab('wallet');
            }}
            className="bg-[#00FF88] hover:bg-emerald-400 text-neutral-950 text-[10px] font-black uppercase px-3 py-2 rounded-lg leading-none cursor-pointer"
          >
            Deposit
          </button>
          <button
            onClick={handleLogout}
            className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-[10px] font-black uppercase px-3 py-2 rounded-lg leading-none cursor-pointer flex items-center gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      </header>

      {/* ======================= LIVE PLAYABLE CASINO APP ======================= */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#0a0a10]">
          {/* CLIENT SIDE NAVIGATION SIDEBAR */}
          <nav className="w-full md:w-64 bg-neutral-950 border-r border-neutral-850 p-4 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">Main Categories</span>
              </div>

              <div className="space-y-1">
                {[
                  { id: 'home', label: 'Vegas Home', icon: <Compass className="h-4 w-4" /> },
                  { id: 'games', label: 'Play Casino Games', icon: <Play className="h-4 w-4 text-[#00FF88]" /> },
                  { id: 'live', label: 'Live Dealer Lobby', icon: <UserCheck className="h-4 w-4 text-rose-500 animate-pulse" /> },
                  { id: 'profile', label: 'Personal Desk / Stats', icon: <User className="h-4 w-4" /> },
                  { id: 'bonuses', label: 'Bonuses & Promos', icon: <Gift className="h-4 w-4" /> },
                  { id: 'vip', label: 'VIP Club Benefits', icon: <Award className="h-4 w-4" /> },
                  { id: 'wallet', label: 'My Wallet', icon: <CreditCard className="h-4 w-4" /> },
                  ...(authSession?.user.role === 'admin' ? [{ id: 'admin', label: 'Admin Audit', icon: <ShieldCheck className="h-4 w-4 text-[#00FF88]" /> }] : []),
                  { id: 'inbox', label: 'Notifications', icon: <Bell className="h-4 w-4 text-yellow-400" /> },
                  { id: 'blog', label: 'Strategy Guidelines', icon: <BookOpen className="h-4 w-4" /> },
                  { id: 'support', label: 'Support center', icon: <HeartHandshake className="h-4 w-4" /> },
                  { id: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> }
                ].map((tab, idx) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      sound.playClick();
                      setActiveCasinoTab(tab.id);
                    }}
                    className={`w-full py-2.5 px-3 rounded-lg text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                      activeCasinoTab === tab.id
                        ? 'bg-gradient-to-r from-neutral-900 via-[#10101c] to-neutral-900 border-l-4 border-l-[#FF0055] text-white shadow-md'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {tab.icon}
                      {tab.label}
                    </span>
                    <span className="text-[9px] text-neutral-600 font-mono">0{idx+1}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-850/40 space-y-3">
              <div className="bg-[#10101C] border border-[#FF0055]/20 p-3 rounded-xl">
                <div className="text-[10px] font-black uppercase text-[#FF0055] tracking-widest flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  RESPONSIBLE PLAY
                </div>
                <div className="text-[9px] text-neutral-400 mt-1 leading-snug">
                  Age limits fully verified. Daily sessions can be configured inside the settings tab.
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] text-neutral-500 mt-2 font-mono">
                <span>Vegas Suite v1.4</span>
                <span className="text-[#00FF88] font-bold">● RNG certified</span>
              </div>
            </div>
          </nav>

          {/* MAIN CASINO VIEW CONTAINER */}
          <main className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6">
            {/* Top promotional banner if active on general tabs */}
            {activeCasinoTab === 'home' && (
              <div className="relative bg-gradient-to-r from-neutral-950 via-[#111] to-neutral-950 rounded-2xl border border-neutral-80 w-full p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <Award className="h-56 w-56 text-pink-500 animate-spin" />
                </div>
                <div className="space-y-4 max-w-lg">
                  <span className="bg-[#FF0055] text-white font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-widest">
                    Hot Promotion Live
                  </span>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white leading-tight">
                    WELCOME BONUS: 100% MATCH UP TO $500 CERTIFIED CREDITS!
                  </h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Double your casino reserves instantly. Grab our standard non-deposit welcome bonus match for testing Vegas Slots, Blackjack, Poker, and Roulette tables.
                  </p>
                  <button
                    onClick={handleClaimWelcomeMatch}
                    className="bg-[#00FF88] hover:bg-emerald-400 text-neutral-950 font-black uppercase text-xs tracking-wider py-2.5 px-6 rounded-lg transition-all"
                  >
                    Claim welcome bonus credits
                  </button>
                </div>
                <div className="text-center bg-[#0B0B14] p-4 rounded-2xl border border-neutral-800 min-w-44 shadow-lg shrink-0">
                  <span className="text-[8px] uppercase tracking-wider text-neutral-500 font-bold block">RTP average rating</span>
                  <span className="text-3xl font-black text-[#00FF88] font-mono block mt-1">98.5%</span>
                  <span className="text-[10px] text-neutral-400 font-mono block mt-1">RNG standard certified</span>
                </div>
              </div>
            )}

            {/* TAB-LOADED INTERACTIVE PROTO APPS */}
            {activeCasinoTab === 'home' && (
              <div className="space-y-6">
                <div className="flex justify-between items-baseline border-b border-neutral-850 pb-2.5">
                  <h2 className="text-lg font-black uppercase text-white flex items-center gap-1.5">
                    <Compass className="h-5 w-5 text-[#FF0055]" />
                    Featured Lobby Games
                  </h2>
                  <button
                    onClick={() => setActiveCasinoTab('games')}
                    className="text-xs text-[#00FF88] hover:underline"
                  >
                    See entire catalog &rarr;
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[
                    { id: 'slots', title: 'Interactive Reels Slots', rtp: '96.5%', provider: 'Spinfuego', icon: '🎰', volatility: 'Low', desc: 'Neon fruit theme with a cyber-jackpot scatter bonus.' },
                    { id: 'blackjack', title: 'Felt Blackjack Room', rtp: '99.5%', provider: 'Evolutionary', icon: '🃏', volatility: 'Medium', desc: 'Standard dealer felt with live Hi-Lo card counting HUD.' },
                    { id: 'roulette', title: 'European Roulette', rtp: '97.3%', provider: 'RND Labs', icon: '🎡', volatility: 'High', desc: 'Bet on colors, parity, or singles. Animated pointer loop.' },
                    { id: 'poker', title: "Texas Hold'em AI", rtp: '98.9%', provider: 'DealerPro', icon: '🏆', volatility: 'High', desc: 'Card tournament with intelligent dealer computer responses.' },
                    { id: 'crash', title: 'Cosmic Flight Crash', rtp: '96.2%', provider: 'NexusStudio', icon: '🚀', volatility: 'Extreme', desc: 'Climbing rocket trajectory. Safe cashouts before detonation.' }
                  ].map(game => (
                    <div key={game.id} className="bg-[#10101C] border border-[#FF0055]/10 rounded-2xl p-5 hover:border-pink-600/30 transition-all flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="text-3xl block">{game.icon}</span>
                          <span className="bg-neutral-900 border border-neutral-800 text-[10px] font-mono px-2 py-0.5 rounded text-neutral-300">
                            {game.rtp} RTP
                          </span>
                        </div>
                        <h4 className="text-md font-extrabold uppercase text-white tracking-wide">{game.title}</h4>
                        <p className="text-xs text-neutral-400 tracking-normal line-clamp-2 leading-relaxed">{game.desc}</p>
                      </div>

                      <div className="flex items-center justify-between border-t border-neutral-850/40 pt-3">
                        <span className="text-[10px] font-mono text-neutral-500">Provider: {game.provider}</span>
                        <button
                          onClick={() => {
                            launchGameFromLobby(game);
                          }}
                          className="bg-[#00FF88] hover:bg-emerald-400 text-neutral-950 font-black uppercase text-[10px] px-3.5 py-1.5 rounded-lg leading-none transition-all cursor-pointer"
                        >
                          Launch Game
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* VIP Rewards Board */}
                <div className="bg-gradient-to-r from-purple-900/10 via-neutral-950 to-purple-900/10 border border-purple-500/20 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-lg">
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-black tracking-widest text-purple-400 block">VIP CLUBS PROGRESSION</span>
                    <h4 className="text-md font-black text-white uppercase tracking-tight">PROGRESS CORRIDORS: GOLD TIER ACTIVE</h4>
                    <p className="text-xs text-neutral-450 leading-relaxed">
                      Collect Cashback of 15% weekly. Claim rewards to progress onto Elite Diamond status.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveCasinoTab('vip')}
                    className="border border-purple-500 hover:bg-gradient-to-r hover:from-purple-500 hover:to-indigo-500 text-purple-300 hover:text-white font-black uppercase text-xs tracking-wider py-2.5 px-6 rounded-lg transition-all cursor-pointer"
                  >
                    Inspect Vip Benefits
                  </button>
                </div>
              </div>
            )}

            {activeCasinoTab === 'games' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-neutral-850 pb-3">
                  <div>
                    <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                      <Play className="h-5 w-5 text-[#00FF88] animate-pulse" />
                      Extended Play Catalog
                    </h2>
                    <p className="text-xs text-neutral-400">Total 20 custom compiled game modules ready for launch.</p>
                  </div>

                  {/* Search Bar Input */}
                  <div className="relative w-full sm:w-64 max-w-sm">
                    <input
                      type="text"
                      placeholder="Search title or provider..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-830 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-[#FF0055]"
                    />
                  </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap gap-4 items-center justify-between bg-neutral-950/40 p-3 rounded-xl border border-neutral-850">
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] text-neutral-400 uppercase font-black mr-2 leading-none self-center">Category:</span>
                    {['all', 'slots', 'blackjack', 'roulette', 'poker', 'crash', 'live'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => {
                          sound.playClick();
                          setFilterCategory(cat);
                        }}
                        className={`py-1 px-3 rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                          filterCategory === cat
                            ? 'bg-[#FF0055] text-white'
                            : 'bg-neutral-900 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <span className="text-[10px] text-neutral-400 uppercase font-black mr-2 self-center">Volatility:</span>
                    {['all', 'Low', 'Medium', 'High', 'Extreme'].map(vol => (
                      <button
                        key={vol}
                        onClick={() => {
                          sound.playClick();
                          setFilterVolatility(vol);
                        }}
                        className={`py-1 px-2 rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                          filterVolatility === vol
                            ? 'bg-purple-600 text-white'
                            : 'bg-neutral-900 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {vol}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid */}
                {filteredGames.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                    {filteredGames.slice(0, 20).map(g => (
                      <div key={g.id} className="bg-[#10101C] border border-[#FF0055]/10 rounded-xl p-4 flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="text-2xl">{g.img}</span>
                            <div className="flex flex-col items-end gap-1">
                              <span className="bg-neutral-900 text-[9px] text-neutral-300 font-mono px-1.5 py-0.5 rounded">
                                RTP: {g.rtp}
                              </span>
                              <span className="bg-purple-950/80 text-purple-400 border border-purple-500/20 text-[8px] font-mono px-1 rounded uppercase font-bold">
                                {g.volatility}
                              </span>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-black uppercase text-white tracking-wide">{g.title}</h4>
                            <span className="text-[9px] text-[#FF0055] font-mono mt-0.5 block">{g.provider}</span>
                          </div>
                          {recommendationRank.has(g.id) && (
                            <div className="flex items-center justify-between bg-neutral-950 border border-neutral-850 rounded px-2 py-1">
                              <span className="text-[9px] text-[#00FF88] font-black uppercase">Rank #{recommendationRank.get(g.id)?.rank}</span>
                              <span className="text-[9px] text-neutral-500 font-mono truncate ml-2">
                                {recommendationRank.get(g.id)?.reasons[0]?.replaceAll('_', ' ')}
                              </span>
                            </div>
                          )}
                          <p className="text-[11px] text-neutral-400 line-clamp-2">{g.description}</p>
                          <div className="mt-1 bg-neutral-900/60 p-1.5 rounded text-[10px] text-neutral-400">
                            Win Chance: <strong className="text-yellow-500 font-mono">{g.winOdds}</strong>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            launchGameFromLobby(g);
                            triggerNotification(`Launching ${g.title} standard game room...`, "success");
                          }}
                          className="w-full bg-[#00FF88] hover:bg-emerald-400 text-neutral-950 font-black uppercase text-[10px] py-1.5 rounded-lg transition-all"
                        >
                          Play standard game
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-[#10101C] rounded-2xl border border-neutral-800 text-neutral-455">
                    No games matching selection tags in our casino matrix right now.
                  </div>
                )}
              </div>
            )}

            {/* EMBEDDED REAL INTERACTIVE GAMES IN CASINO TAB MODE */}
            {activeCasinoTab === 'slots' && (
              <SlotsGame
                user={user}
                onSpin={spinSlotsGameRound}
                onTriggerNotification={triggerNotification}
              />
            )}

            {activeCasinoTab === 'blackjack' && (
              <BlackjackGame
                user={user}
                onUpdateWallet={(amount) => handleUpdateWallet(amount, 'blackjack')}
                onStartRound={startBlackjackGameRound}
                onActionRound={actBlackjackGameRound}
                onTriggerNotification={triggerNotification}
              />
            )}

            {activeCasinoTab === 'roulette' && (
              <RouletteGame
                user={user}
                onUpdateWallet={(amount) => handleUpdateWallet(amount, 'roulette')}
                onResolveSpin={resolveRouletteSpin}
                onTriggerNotification={triggerNotification}
              />
            )}

            {activeCasinoTab === 'poker' && (
              <PokerGame
                user={user}
                onUpdateWallet={(amount) => handleUpdateWallet(amount, 'poker')}
                onStartRound={startPokerGameRound}
                onActionRound={actPokerGameRound}
                onTriggerNotification={triggerNotification}
              />
            )}

            {activeCasinoTab === 'crash' && (
              <CrashGame
                user={user}
                onUpdateWallet={(amount) => handleUpdateWallet(amount, 'crash')}
                onStartRound={startCrashGameRound}
                onCashoutRound={cashoutCrashGameRound}
                onTriggerNotification={triggerNotification}
              />
            )}

            {activeCasinoTab === 'live' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-rose-500 animate-pulse animate-bounce" />
                    Live Electronic Dealer Lobby
                  </h2>
                  <p className="text-xs text-neutral-400">Interact with simulated high bandwidth electronic streams hosted 24/7.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {[
                    { id: 'live-bj', title: 'Live Emerald Blackjack', players: 142, stake: '$5 - $1000', code: 'blackjack', img: '👩‍💼', dealer: 'Amelia Miller' },
                    { id: 'live-rt', title: 'Live Golden Fortune Wheel', players: 389, stake: '$10 - $2500', code: 'roulette', img: '🎡', dealer: 'Dmitri Vanko' },
                    { id: 'live-pk', title: 'Live Holdem Masters Arena', players: 84, stake: '$25 - $500', code: 'poker', img: '🤵', dealer: 'James Carter' }
                  ].map(item => (
                    <div key={item.id} className="bg-[#10101C] border border-[#FF0055]/10 rounded-2xl overflow-hidden shadow-xl hover:scale-[1.01] transition-all">
                      {/* Video graphic section */}
                      <div className="bg-neutral-900 h-44 flex items-center justify-center relative bg-gradient-to-tr from-[#1A1A2E] to-neutral-950">
                        <div className="absolute top-2.5 right-2.5 bg-rose-600 font-bold uppercase text-[8px] text-white px-2 py-0.5 rounded-full flex items-center gap-1 leading-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          LIVE BROADCAST
                        </div>
                        <span className="text-5xl block select-none">{item.img}</span>
                        <div className="absolute bottom-2 left-2.5 bg-neutral-950/80 px-2 py-1 rounded text-[10px] font-mono">
                          Dealer: <strong className="text-rose-400">{item.dealer}</strong>
                        </div>
                      </div>

                      <div className="p-4 space-y-4">
                        <div>
                          <h4 className="text-xs font-black uppercase text-white block">{item.title}</h4>
                          <div className="flex justify-between text-[10px] text-neutral-400 mt-1">
                            <span>Players: <strong className="text-emerald-400">{item.players} online</strong></span>
                            <span>Stake: <strong className="text-yellow-400 font-mono">{item.stake}</strong></span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            sound.playClick();
                            setActiveCasinoTab(item.code);
                            triggerNotification(`Connecting to ${item.dealer} table. Seating player...`, "success");
                          }}
                          className="w-full bg-red-600 hover:bg-red-500 font-bold uppercase text-[10px] py-2 rounded-lg text-white transition-all cursor-pointer"
                        >
                          Join Table Room
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GENERAL TABS */}
            {activeCasinoTab === 'profile' && (
              <div className="max-w-xl mx-auto bg-[#10101C] border border-[#FF0055]/10 p-6 rounded-2xl space-y-6">
                <div className="flex items-center gap-4">
                  <span className="text-5xl bg-neutral-900 border border-neutral-800 p-3 rounded-full">{user.avatar}</span>
                  <div>
                    <h3 className="text-md font-black uppercase text-white tracking-wide">{user.username}</h3>
                    <div className="flex gap-2 items-center mt-1">
                      <span className="bg-yellow-500 text-neutral-950 font-bold text-[9px] uppercase px-2 py-0.5 rounded">
                        VIP {user.vipTier}
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">Joined: {user.joinedDate}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0B0B14] p-3 rounded-lg border border-neutral-850/60 text-center">
                    <span className="text-[10px] text-neutral-400 uppercase font-black tracking-wider block">Wallet Reserve</span>
                    <span className="text-xl font-black text-[#00FF88] font-mono block mt-1">${user.walletBalance}</span>
                  </div>

                  <div className="bg-[#0B0B14] p-3 rounded-lg border border-neutral-850/60 text-center">
                    <span className="text-[10px] text-neutral-400 uppercase font-black tracking-wider block">Biggest Win Match</span>
                    <span className="text-xl font-black text-yellow-500 font-mono block mt-1">${user.biggestWin}</span>
                  </div>
                </div>

                <div className="border-t border-neutral-850/40 pt-4 space-y-2.5">
                  <h4 className="text-[11px] uppercase font-black tracking-widest text-[#FF0055]">User Session telemetry Statistics</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                    <div className="bg-neutral-900 p-2.5 rounded  border border-neutral-850">
                      <div className="text-neutral-500 text-[9px]">Spins</div>
                      <div className="text-white font-mono font-bold">{user.totalSpins}</div>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded  border border-neutral-850">
                      <div className="text-neutral-500 text-[9px]">BJ Wins</div>
                      <div className="text-white font-mono font-bold">{user.totalBlackjackWins}</div>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded  border border-neutral-850">
                      <div className="text-neutral-500 text-[9px]">Roulettes Wins</div>
                      <div className="text-white font-mono font-bold">{user.totalRouletteWins}</div>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded  border border-neutral-850">
                      <div className="text-neutral-500 text-[9px]">Crash Wins</div>
                      <div className="text-white font-mono font-bold">{user.totalCrashWins}</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    sound.playClick();
                    triggerNotification("Session settings preserved successfully!", "info");
                  }}
                  className="w-full bg-[#FF0055] hover:bg-pink-600 font-bold uppercase text-xs py-2.5 rounded-xl transition-all block"
                >
                  Save settings
                </button>
              </div>
            )}

            {activeCasinoTab === 'bonuses' && (
              <div className="max-w-2xl mx-auto space-y-6">
                <div>
                  <h2 className="text-lg font-black uppercase text-white flex items-center gap-1.5">
                    <Gift className="h-5 w-5 text-[#FF0055]" />
                    Promotions desk
                  </h2>
                  <p className="text-xs text-neutral-400">Claim match rewards and non-deposit credits to play.</p>
                </div>

                {targetedBonuses.length > 0 && (
                  <div className="bg-[#10101C] border border-[#00FF88]/20 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-[11px] uppercase font-black tracking-widest text-[#00FF88]">Targeted Offers</h3>
                        <p className="text-[10px] text-neutral-500">Deterministic segment offers with reason codes.</p>
                      </div>
                      <button
                        onClick={loadTargetedBonuses}
                        className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-[9px] font-black uppercase px-2.5 py-1.5 rounded"
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {targetedBonuses.slice(0, 2).map(offer => (
                        <div key={offer.id} className="bg-neutral-950 border border-neutral-850 rounded-lg p-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="text-[9px] uppercase font-black text-[#FF0055]">{offer.segment}</span>
                              <h4 className="text-xs font-black uppercase text-white">{offer.title}</h4>
                            </div>
                            <span className="text-xs font-black font-mono text-[#00FF88]">${offer.amount}</span>
                          </div>
                          <p className="text-[10px] text-neutral-400 leading-relaxed">{offer.description}</p>
                          <div className="text-[9px] text-neutral-500 font-mono truncate">
                            {offer.reasonCodes.join(' / ').replaceAll('_', ' ')}
                          </div>
                          <button
                            onClick={() => void claimTargetedBonus(offer)}
                            className="w-full bg-[#00FF88] hover:bg-emerald-400 text-neutral-950 font-black text-[10px] uppercase py-2 rounded-lg transition-all"
                          >
                            Claim targeted offer
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Welcome Bonus Card */}
                  <div className="bg-[#10101C] border border-[#FF0055]/20 p-5 rounded-2xl space-y-4 hover:border-[#FF0055]/40 transition-all flex flex-col justify-between">
                    <div className="space-y-2">
                      <span className="bg-[#FF0055] text-[9px] uppercase font-black px-2 py-0.5 rounded tracking-wider">WELCOME SPEC</span>
                      <h4 className="text-sm font-black text-white uppercase tracking-tight">100% Match Welcome Bonus</h4>
                      <p className="text-xs text-neutral-400">Claim matching virtual credits up to $500 to expand wagering limits.</p>
                    </div>
                    <button
                      onClick={handleClaimWelcomeMatch}
                      className="w-full bg-[#00FF88] hover:bg-emerald-400 text-neutral-950 font-black text-xs uppercase py-2.5 rounded-lg transition-all"
                    >
                      Match Deposit credit
                    </button>
                  </div>

                  {/* Daily Free spins */}
                  <div className="bg-[#10101C] border border-purple-500/20 p-5 rounded-2xl space-y-4 hover:border-purple-500/40 transition-all flex flex-col justify-between">
                    <div className="space-y-2">
                      <span className="bg-purple-600 text-[9px] uppercase font-black px-2 py-0.5 rounded tracking-wider">DAILY FREE RESET</span>
                      <h4 className="text-sm font-black text-white uppercase tracking-tight">50 No Deposit Spins</h4>
                      <p className="text-xs text-neutral-400">Claim non-deposit daily spins resetting credentials by +$100 instantly.</p>
                    </div>
                    <button
                      onClick={claimDailySpins}
                      className="w-full bg-purple-600 hover:bg-purple-500 font-bold text-xs uppercase py-2.5 rounded-lg text-white transition-all"
                    >
                      Claim daily free reserves
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeCasinoTab === 'vip' && (
              <div className="max-w-xl mx-auto bg-[#10101C] border border-[#FF0055]/10 p-6 rounded-2xl space-y-6">
                <div className="text-center space-y-1">
                  <span className="text-[9px] font-black uppercase text-purple-400 tracking-widest block">VIP CLUB LEVEL</span>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Bronze &rarr; Silver &rarr; Gold (Active) &rarr; Diamond</h3>
                  <div className="h-2 w-full bg-neutral-900 rounded-full mt-2 overflow-hidden border border-neutral-800">
                    <div className="h-full w-2/3 bg-gradient-to-r from-purple-500 to-indigo-500" />
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-1 block">Level Progress (68/100 points to Platinum VIP level)</span>
                </div>

                <div className="border-t border-neutral-850/40 pt-4 space-y-3">
                  <h4 className="text-xs font-black uppercase text-neutral-300">Active High-Roller Perks:</h4>
                  <ul className="space-y-2 text-xs text-neutral-450 list-disc list-inside">
                    <li>15% Weekly Cashbacks credited on Mondays</li>
                    <li>Advanced RNG analyzer true metrics limits unlocked</li>
                    <li>Exclusive access to live high limit Blackjack and Holdem suites</li>
                    <li>Direct support line priorities</li>
                  </ul>
                </div>
              </div>
            )}

            {activeCasinoTab === 'wallet' && (
              <div className="max-w-md mx-auto bg-[#10101C] border border-neutral-800 p-6 rounded-2xl space-y-6">
                <div>
                  <h3 className="text-md font-black text-white uppercase tracking-tight">Virtual Payment desk</h3>
                  <p className="text-xs text-neutral-400">Mock credentials sandbox environment for platform test.</p>
                </div>

                <div className="bg-[#0b0b14] border border-neutral-850 p-4 rounded-xl text-center">
                  <span className="text-[10px] text-neutral-500 uppercase font-black">Current Balance</span>
                  <span className="block text-2xl font-black text-[#00FF88] mt-1 font-mono">${user.walletBalance}</span>
                </div>

                {/* Simulated Payment Modes */}
                <div className="space-y-2">
                  <span className="text-[10px] text-neutral-400 font-black uppercase block">Deposit Sandbox Method:</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        sound.playClick();
                        handleUpdateWallet(100);
                        triggerNotification("Simulated Credit Card: Loaded +$100!", "success");
                      }}
                      className="bg-neutral-900 hover:bg-neutral-850 text-[10px] py-2 px-1.5 rounded-lg font-bold transition-all border border-neutral-800 text-center uppercase cursor-pointer"
                    >
                      💳 Credit Card
                    </button>

                    <button
                      onClick={() => {
                        sound.playClick();
                        handleUpdateWallet(250);
                        triggerNotification("Simulated Crypto Deposit: Loaded +$250!", "success");
                      }}
                      className="bg-neutral-900 hover:bg-neutral-850 text-[10px] py-2 px-1.5 rounded-lg font-bold transition-all border border-neutral-800 text-center uppercase cursor-pointer"
                    >
                      🪙 Cryptos BTC/ETH
                    </button>

                    <button
                      onClick={() => {
                        sound.playClick();
                        handleUpdateWallet(500);
                        triggerNotification("Simulated Bank wire: Loaded +$500!", "success");
                      }}
                      className="bg-neutral-900 hover:bg-neutral-850 text-[10px] py-2 px-1.5 rounded-lg font-bold transition-all border border-neutral-800 text-center uppercase cursor-pointer"
                    >
                      🏦 Bank Wire
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    sound.playClick();
                    if (user.walletBalance <= 0) {
                      sound.playError();
                      triggerNotification("Wallet has zero funds available to withdraw!", "error");
                    } else {
                      handleUpdateWallet(-user.walletBalance);
                      sound.playBigWin();
                      triggerNotification("Withdrawal requested successfully inside mock ledger!", "success");
                    }
                  }}
                  className="w-full bg-[#00FF88] hover:bg-emerald-400 text-neutral-950 font-black text-xs py-3 rounded-xl transition-all block uppercase"
                >
                  Withdraw entire reserves
                </button>
              </div>
            )}

            {activeCasinoTab === 'admin' && (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-850 pb-3">
                  <div>
                    <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-[#00FF88]" />
                      Admin Audit
                    </h2>
                    <p className="text-xs text-neutral-400">Operational view for wallet, ledger, rounds, risk, and bonus claims.</p>
                  </div>
                  <button
                    onClick={loadAdminSummary}
                    className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-[10px] font-black uppercase px-3 py-2 rounded-lg"
                  >
                    {adminLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    ['Available', `$${adminSummary?.wallet.available ?? user.walletBalance}`],
                    ['Locked', `$${adminSummary?.wallet.locked ?? 0}`],
                    ['Rounds', String(adminSummary?.rounds.length ?? 0)],
                    ['Open Risk', String(adminSummary?.riskEvents.filter(event => event.status === 'open').length ?? 0)]
                  ].map(([label, value]) => (
                    <div key={label} className="bg-[#10101C] border border-neutral-850 p-3 rounded-lg">
                      <span className="text-[9px] uppercase font-black text-neutral-500">{label}</span>
                      <span className="block text-lg font-black text-[#00FF88] font-mono mt-1">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <AdminPanel title="Recent Ledger">
                    {(adminSummary?.ledger ?? []).slice(0, 8).map(entry => (
                      <AdminRow key={entry.id} left={entry.type} right={`$${entry.amount}`} detail={entry.createdAt.slice(0, 19).replace('T', ' ')} />
                    ))}
                    {adminSummary?.ledger.length === 0 && <EmptyAdminRow />}
                  </AdminPanel>

                  <AdminPanel title="Recent Rounds">
                    {(adminSummary?.rounds ?? []).slice(0, 8).map(round => (
                      <AdminRow key={round.id} left={`${round.gameId} / ${round.status}`} right={`$${round.stake}`} detail={`Payout $${round.payout}`} />
                    ))}
                    {adminSummary?.rounds.length === 0 && <EmptyAdminRow />}
                  </AdminPanel>

                  <AdminPanel title="Risk Queue">
                    {(adminSummary?.riskEvents ?? []).slice(0, 8).map(event => (
                      <AdminRow key={event.id} left={`${event.type} / ${event.severity}`} right={String(event.score)} detail={event.createdAt.slice(0, 19).replace('T', ' ')} />
                    ))}
                    {adminSummary?.riskEvents.length === 0 && <EmptyAdminRow />}
                  </AdminPanel>

                  <AdminPanel title="Compliance Cases">
                    {(adminSummary?.complianceCases ?? []).slice(0, 8).map(caseRecord => (
                      <AdminRow
                        key={caseRecord.id}
                        left={`${caseRecord.type} / ${caseRecord.status}`}
                        right={caseRecord.priority}
                        detail={`${caseRecord.title} / ${caseRecord.notes.length} notes`}
                      />
                    ))}
                    {adminSummary?.complianceCases.length === 0 && <EmptyAdminRow />}
                  </AdminPanel>

                  <AdminPanel title="Bonus Claims">
                    {(adminSummary?.bonusClaims ?? []).slice(0, 8).map(claim => (
                      <AdminRow key={claim.id} left={claim.campaignId} right={`$${claim.amount}`} detail={`${claim.status} / ${claim.claimKey}`} />
                    ))}
                    {adminSummary?.bonusClaims.length === 0 && <EmptyAdminRow />}
                  </AdminPanel>

                  <AdminPanel title="AI Events">
                    {(adminSummary?.aiEvents ?? []).slice(0, 8).map(event => (
                      <AdminRow
                        key={event.id}
                        left={`${event.category} / ${event.name}`}
                        right={<Activity className="h-3.5 w-3.5" />}
                        detail={event.createdAt.slice(0, 19).replace('T', ' ')}
                      />
                    ))}
                    {adminSummary?.aiEvents.length === 0 && <EmptyAdminRow />}
                  </AdminPanel>

                  <AdminPanel title="AI Explanations">
                    {(adminSummary?.aiDecisionExplanations ?? []).slice(0, 8).map(explanation => (
                      <AdminRow
                        key={explanation.id}
                        left={`${explanation.decisionType} / ${explanation.modelVersion}`}
                        right={explanation.reasonCodes[0] ?? 'trace'}
                        detail={explanation.createdAt.slice(0, 19).replace('T', ' ')}
                      />
                    ))}
                    {adminSummary?.aiDecisionExplanations.length === 0 && <EmptyAdminRow />}
                  </AdminPanel>

                  <AdminPanel title="AI Model Health">
                    {adminSummary?.aiModelHealth ? (
                      <>
                        <AdminRow
                          left="Overall status"
                          right={adminSummary.aiModelHealth.status}
                          detail={adminSummary.aiModelHealth.generatedAt.slice(0, 19).replace('T', ' ')}
                        />
                        {adminSummary.aiModelHealth.metrics.slice(0, 3).map(metric => (
                          <AdminRow
                            key={metric.modelKey}
                            left={`${metric.modelKey} / ${metric.status}`}
                            right={`${Math.round(metric.fallbackRatio * 100)}% fallback`}
                            detail={metric.reasonCodes.slice(0, 2).join(' / ')}
                          />
                        ))}
                      </>
                    ) : (
                      <EmptyAdminRow />
                    )}
                  </AdminPanel>

                  <AdminPanel title="AI Feature Profile">
                    {adminSummary?.aiFeatureSnapshot ? (
                      <>
                        <AdminRow
                          left="Snapshot version"
                          right={adminSummary.aiFeatureSnapshot.version}
                          detail={`${adminSummary.aiFeatureSnapshot.sourceEventCount} source events`}
                        />
                        <AdminRow
                          left="Favorite game"
                          right={adminSummary.aiFeatureSnapshot.features.gameSignals.favoriteGameId ?? 'n/a'}
                          detail={`Average stake $${adminSummary.aiFeatureSnapshot.features.gameSignals.averageStake}`}
                        />
                        <AdminRow
                          left="Bonus value"
                          right={`$${adminSummary.aiFeatureSnapshot.features.bonusSignals.totalClaimed}`}
                          detail={`${adminSummary.aiFeatureSnapshot.features.bonusSignals.claims} claims`}
                        />
                        <AdminRow
                          left="High stake ratio"
                          right={`${Math.round(adminSummary.aiFeatureSnapshot.features.riskSignals.highStakeRatio * 100)}%`}
                          detail={`${adminSummary.aiFeatureSnapshot.features.riskSignals.highStakeRounds} high stake rounds`}
                        />
                      </>
                    ) : (
                      <EmptyAdminRow />
                    )}
                  </AdminPanel>

                  <AdminPanel title="Churn Risk">
                    {adminSummary?.churnScore ? (
                      <>
                        <AdminRow
                          left={`${adminSummary.churnScore.band} / ${adminSummary.churnScore.version}`}
                          right={String(adminSummary.churnScore.score)}
                          detail={adminSummary.churnScore.reasonCodes.slice(0, 2).join(' / ')}
                        />
                        <AdminRow
                          left="Retention action"
                          right={adminSummary.churnScore.recommendedActions[0] ?? 'monitor'}
                          detail={adminSummary.churnScore.createdAt.slice(0, 19).replace('T', ' ')}
                        />
                      </>
                    ) : (
                      <EmptyAdminRow />
                    )}
                  </AdminPanel>

                  <AdminPanel title="Fraud Score">
                    {adminSummary?.fraudScore ? (
                      <>
                        <AdminRow
                          left={`${adminSummary.fraudScore.band} / ${adminSummary.fraudScore.version}`}
                          right={String(adminSummary.fraudScore.score)}
                          detail={adminSummary.fraudScore.reasonCodes.slice(0, 2).join(' / ')}
                        />
                        <AdminRow
                          left="Review action"
                          right={adminSummary.fraudScore.recommendedActions[0] ?? 'monitor'}
                          detail={adminSummary.fraudScore.createdAt.slice(0, 19).replace('T', ' ')}
                        />
                      </>
                    ) : (
                      <EmptyAdminRow />
                    )}
                  </AdminPanel>

                  <AdminPanel title="Responsible Play">
                    {adminSummary?.responsiblePlayIntervention ? (
                      <>
                        <AdminRow
                          left={`${adminSummary.responsiblePlayIntervention.level} / ${adminSummary.responsiblePlayIntervention.version}`}
                          right={String(adminSummary.responsiblePlayIntervention.score)}
                          detail={adminSummary.responsiblePlayIntervention.reasonCodes.slice(0, 2).join(' / ')}
                        />
                        <AdminRow
                          left="Intervention"
                          right={adminSummary.responsiblePlayIntervention.requiresAcknowledgement ? 'ack required' : 'notice'}
                          detail={adminSummary.responsiblePlayIntervention.createdAt.slice(0, 19).replace('T', ' ')}
                        />
                      </>
                    ) : (
                      <EmptyAdminRow />
                    )}
                  </AdminPanel>
                </div>
              </div>
            )}

            {activeCasinoTab === 'inbox' && (
              <div className="max-w-3xl mx-auto space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-850 pb-3">
                  <div>
                    <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                      <Bell className="h-5 w-5 text-yellow-400" />
                      Notification Inbox
                    </h2>
                    <p className="text-xs text-neutral-400">Persisted account messages from bonuses, support, and platform events.</p>
                  </div>
                  <button
                    onClick={loadNotifications}
                    className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-[10px] font-black uppercase px-3 py-2 rounded-lg"
                  >
                    {notificationsLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#10101C] border border-neutral-850 p-3 rounded-lg">
                    <span className="text-[9px] uppercase font-black text-neutral-500">Unread</span>
                    <span className="block text-lg font-black text-yellow-400 font-mono mt-1">
                      {notifications.filter(item => !item.readAt).length}
                    </span>
                  </div>
                  <div className="bg-[#10101C] border border-neutral-850 p-3 rounded-lg">
                    <span className="text-[9px] uppercase font-black text-neutral-500">Total</span>
                    <span className="block text-lg font-black text-[#00FF88] font-mono mt-1">{notifications.length}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {notifications.map(notification => (
                    <div key={notification.id} className="bg-[#10101C] border border-neutral-850 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${notification.readAt ? 'bg-neutral-700' : 'bg-yellow-400'}`} />
                          <span className="text-xs font-black uppercase text-white">{notification.title}</span>
                          <span className="text-[9px] uppercase font-black text-neutral-500">{notification.type}</span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">{notification.message}</p>
                        <span className="block text-[10px] text-neutral-600 font-mono mt-1">
                          {notification.createdAt.slice(0, 19).replace('T', ' ')}
                        </span>
                      </div>
                      {!notification.readAt && (
                        <button
                          onClick={() => markInboxItemRead(notification.id)}
                          className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-[10px] font-black uppercase px-3 py-2 rounded-lg shrink-0"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <div className="bg-[#10101C] border border-neutral-850 rounded-lg p-6 text-center text-xs text-neutral-500">
                      No notifications yet.
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeCasinoTab === 'blog' && (
              <div className="max-w-3xl mx-auto space-y-6">
                <div>
                  <h2 className="text-lg font-black uppercase text-white flex items-center gap-1.5">
                    <BookOpen className="h-5 w-5 text-[#FF0055]" />
                    iGaming Strategy & News blog
                  </h2>
                  <p className="text-xs text-neutral-400">Discover statistics calculations on slots RNG, cards logic, and mathematics.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {BLOG_DATA.map(p => (
                    <div key={p.id} className="bg-[#10101C] border border-[#FF0055]/10 rounded-xl p-4 space-y-3">
                      <span className="bg-neutral-900 text-purple-400 border border-purple-500/10 text-[9px] font-bold px-2 py-0.5 rounded uppercase font-mono">
                        {p.category}
                      </span>
                      <h4 className="text-xs font-black uppercase text-white leading-snug">{p.title}</h4>
                      <p className="text-[11px] text-neutral-400 leading-normal">{p.summary}</p>
                      <div className="border-t border-neutral-855 pt-2 text-[10px] text-neutral-500 flex justify-between">
                        <span>By {p.author}</span>
                        <span>{p.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeCasinoTab === 'support' && (
              <div className="max-w-lg mx-auto bg-[#10101C] border border-neutral-800 p-6 rounded-2xl space-y-6">
                <div>
                  <span className="text-[10px] font-black uppercase text-[#FF0055] tracking-widest block">CASINO HELP DESK</span>
                  <h3 className="text-md font-black text-white uppercase mt-0.5">Dispatched validation channels</h3>
                  <p className="text-xs text-neutral-400">Reach a live representative. Average resolution time: &lt; 5 minutes.</p>
                </div>

                {supportSubmitted ? (
                  <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-xl text-center space-y-2">
                    <CheckCircle className="h-8 w-8 text-[#00FF88] mx-auto animate-bounce" />
                    <h4 className="text-xs font-bold text-white uppercase">Your message has been validated!</h4>
                    <p className="text-[11px] text-neutral-450 leading-relaxed">
                      Thank you. We have received your query. A designated casino advisor will reach back immediately at your registered credentials.
                    </p>
                    <button
                      onClick={() => {
                        sound.playClick();
                        setSupportSubmitted(false);
                        setSupportForm({ name: '', email: '', message: '' });
                      }}
                      className="text-xs text-[#00FF88] hover:underline"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSupportFormSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-neutral-400">Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Cleon Poker"
                        value={supportForm.name}
                        onChange={(e) => setSupportForm({ ...supportForm, name: e.target.value })}
                        className="w-full bg-neutral-900 border border-neutral-830 rounded-lg py-2 px-3 text-xs text-neutral-100 focus:outline-none focus:border-[#FF0055]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-neutral-400">Email Address (Registered)</label>
                      <input
                        type="email"
                        required
                        placeholder="you@registered.com"
                        value={supportForm.email}
                        onChange={(e) => setSupportForm({ ...supportForm, email: e.target.value })}
                        className="w-full bg-neutral-900 border border-neutral-830 rounded-lg py-2 px-3 text-xs text-neutral-100 focus:outline-none focus:border-[#FF0055]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-neutral-400">Details of Inquiry</label>
                      <textarea
                        required
                        rows={3}
                        placeholder="Describe the transaction issue or dynamic odds rules questions..."
                        value={supportForm.message}
                        onChange={(e) => setSupportForm({ ...supportForm, message: e.target.value })}
                        className="w-full bg-neutral-900 border border-neutral-830 rounded-lg py-2.5 px-3 text-xs text-neutral-100 focus:outline-none focus:border-[#FF0055]"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-[#FF0055] hover:bg-pink-600 font-extrabold uppercase text-xs tracking-wider py-2.5 rounded-lg transition-all"
                    >
                      Submit inquiry validation
                    </button>
                  </form>
                )}
              </div>
            )}

            {activeCasinoTab === 'settings' && (
              <div className="max-w-xl mx-auto bg-[#10101C] border border-neutral-800 p-6 rounded-2xl space-y-6">
                <div>
                  <h3 className="text-md font-black text-white uppercase tracking-tight">Casino Preferences & Security Panel</h3>
                  <p className="text-xs text-neutral-400">Adjust standard parameters, notification targets, and compliance requirements.</p>
                </div>

                <div className="space-y-4">
                  {/* GDPR Consent */}
                  <div className="flex items-start gap-3 bg-[#0B0B14] p-3 rounded-xl border border-neutral-850/60">
                    <input
                      type="checkbox"
                      id="gdpr_set"
                      checked={gdprChecked}
                      onChange={(e) => {
                        sound.playClick();
                        setGdprChecked(e.target.checked);
                      }}
                      className="rounded text-pink-650 focus:ring-0 mt-0.5"
                    />
                    <div>
                      <label htmlFor="gdpr_set" className="text-xs font-bold text-neutral-200 uppercase block cursor-pointer">
                        Privacy & GDPR Compliance Checked
                      </label>
                      <span className="text-[10px] text-neutral-400 block mt-0.5">
                        Authorise storing transient statistics and cache sequences to optimize web frame loading speeds.
                      </span>
                    </div>
                  </div>

                  {/* Age constraint */}
                  <div className="flex items-start gap-3 bg-[#0B0B14] p-3 rounded-xl border border-neutral-850/60">
                    <input
                      type="checkbox"
                      id="age_set"
                      checked={registeredAgeChecked}
                      onChange={(e) => {
                        sound.playClick();
                        setRegisteredAgeChecked(e.target.checked);
                      }}
                      className="rounded text-[#00FF88] focus:ring-0 mt-0.5"
                    />
                    <div>
                      <label htmlFor="age_set" className="text-xs font-bold text-neutral-200 uppercase block cursor-pointer">
                        Age Requirement Verification Checked (18+)
                      </label>
                      <span className="text-[10px] text-neutral-400 block mt-0.5">
                        Certify that users accessing raw blackjack/poker/roulette algorithms strictly exceed age limits of 18.
                      </span>
                    </div>
                  </div>

                  {/* Timeout */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-400">Responsible play limit timeout</label>
                    <select
                      value={sessionTimeoutInput}
                      onChange={(e) => {
                        sound.playClick();
                        setSessionTimeoutInput(e.target.value);
                        triggerNotification(`Maximum active play flight limited to ${e.target.value}!`, "info");
                      }}
                      className="w-full bg-neutral-900 border border-neutral-830 rounded-lg py-2 px-3 text-xs"
                    >
                      <option value="15 mins">15 mins before lock alert</option>
                      <option value="30 mins">30 mins standard corridor</option>
                      <option value="1 hour">1 hour automatic timeout logout</option>
                      <option value="Unlimited">No limits (Wager responsible)</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-neutral-850/40 pt-4 flex gap-3">
                  <button
                    onClick={() => {
                      sound.playClick();
                      triggerNotification("Settings saved inside mock storage!", "success");
                    }}
                    className="bg-[#00FF88] hover:bg-emerald-400 text-neutral-950 font-black text-xs py-2 px-6 rounded-lg uppercase"
                  >
                    Save Changes
                  </button>

                  <button
                    onClick={() => {
                      sound.playClick();
                      if (confirm("Are you sure you want to delete this casino profile and empty your balance?")) {
                        setUser({
                          username: 'DeletedPlayer',
                          avatar: '🎭',
                          vipTier: 'Bronze',
                          walletBalance: 0,
                          isVip: false,
                          totalSpins: 0,
                          totalBlackjackWins: 0,
                          totalRouletteWins: 0,
                          totalPokerWins: 0,
                          totalCrashWins: 0,
                          biggestWin: 0,
                          joinedDate: '2026-06-16',
                          dailyStreak: 0,
                          lastDailyClaim: null,
                          freeSpinsLeft: 0
                        });
                        triggerNotification("Credentials and totals wiped successfully!", "error");
                        setActiveCasinoTab('home');
                      }
                    }}
                    className="bg-red-805/20 hover:bg-red-900 border border-red-500/30 text-red-400 hover:text-white text-xs py-2 px-4 rounded-lg uppercase transition-all"
                  >
                    Reset Profile Storage
                  </button>
                </div>
              </div>
            )}
          </main>
      </div>
      </>
      )}
    </div>
  );
}

interface AuthGateProps {
  mode: 'login' | 'register';
  setMode: (mode: 'login' | 'register') => void;
  form: {
    username: string;
    email: string;
    password: string;
    displayName: string;
    dateOfBirth: string;
    acceptAgeGate: boolean;
    acceptTerms: boolean;
    acceptPrivacy: boolean;
    adminInviteCode: string;
  };
  setForm: React.Dispatch<React.SetStateAction<AuthGateProps['form']>>;
  submitting: boolean;
  onSubmit: (event: React.FormEvent) => void;
}

const AdminPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  return (
    <section className="bg-[#10101C] border border-neutral-850 rounded-lg p-4 space-y-3">
      <h3 className="text-[11px] uppercase font-black tracking-widest text-[#FF0055]">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
};

const AdminRow: React.FC<{ left: string; right: React.ReactNode; detail: string }> = ({ left, right, detail }) => {
  return (
    <div className="flex items-center justify-between gap-3 bg-neutral-950 border border-neutral-850 rounded-md px-3 py-2">
      <div className="min-w-0">
        <span className="block text-xs font-bold text-neutral-200 truncate">{left}</span>
        <span className="block text-[10px] text-neutral-500 font-mono truncate">{detail}</span>
      </div>
      <span className="text-xs font-black text-[#00FF88] font-mono shrink-0">{right}</span>
    </div>
  );
};

const EmptyAdminRow: React.FC = () => {
  return (
    <div className="bg-neutral-950 border border-neutral-850 rounded-md px-3 py-3 text-[11px] text-neutral-500">
      No records yet.
    </div>
  );
};

function AuthGate({ mode, setMode, form, setForm, submitting, onSubmit }: AuthGateProps) {
  return (
    <main className="min-h-screen bg-[#0B0B14] text-neutral-100 flex items-center justify-center p-4">
      <section className="w-full max-w-md bg-[#10101C] border border-[#FF0055]/20 rounded-xl p-6 space-y-5 shadow-2xl">
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-widest font-black text-[#00FF88]">Private Access</span>
          <h1 className="text-xl font-black uppercase tracking-wide text-white">Vegas Neon Arena</h1>
          <p className="text-xs text-neutral-400">
            Use a private account before wallet or game actions are available.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-neutral-950 p-1 rounded-lg">
          {(['register', 'login'] as const).map(nextMode => (
            <button
              key={nextMode}
              type="button"
              onClick={() => setMode(nextMode)}
              className={`py-2 rounded-md text-[10px] uppercase font-black ${mode === nextMode ? 'bg-[#FF0055] text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              {nextMode}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[10px] uppercase font-bold text-neutral-400">{mode === 'register' ? 'Username' : 'Username or Email'}</span>
            <input
              value={form.username}
              onChange={event => setForm(prev => ({ ...prev, username: event.target.value }))}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-[#FF0055]"
              required
            />
          </label>

          {mode === 'register' && (
            <>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase font-bold text-neutral-400">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-[#FF0055]"
                  placeholder="optional"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Display Name</span>
                  <input
                    value={form.displayName}
                    onChange={event => setForm(prev => ({ ...prev, displayName: event.target.value }))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-[#FF0055]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Birth Date</span>
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={event => setForm(prev => ({ ...prev, dateOfBirth: event.target.value }))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-[#FF0055]"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase font-bold text-neutral-400">Admin Invite Code</span>
                <input
                  value={form.adminInviteCode}
                  onChange={event => setForm(prev => ({ ...prev, adminInviteCode: event.target.value }))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-[#FF0055]"
                  placeholder="optional"
                />
              </label>
            </>
          )}

          <label className="block space-y-1">
            <span className="text-[10px] uppercase font-bold text-neutral-400">Password</span>
            <input
              type="password"
              value={form.password}
              onChange={event => setForm(prev => ({ ...prev, password: event.target.value }))}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-[#FF0055]"
              minLength={10}
              required
            />
          </label>

          {mode === 'register' && (
            <div className="space-y-2 bg-neutral-950 border border-neutral-850 rounded-lg p-3">
              {[
                ['acceptAgeGate', 'I confirm I meet the required age for this private project.'],
                ['acceptTerms', 'I accept the private project terms.'],
                ['acceptPrivacy', 'I accept profile and session data storage.']
              ].map(([key, label]) => (
                <label key={key} className="flex gap-2 text-[11px] text-neutral-300">
                  <input
                    type="checkbox"
                    checked={Boolean(form[key as keyof typeof form])}
                    onChange={event => setForm(prev => ({ ...prev, [key]: event.target.checked }))}
                    className="mt-0.5"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#00FF88] hover:bg-emerald-400 disabled:opacity-60 text-neutral-950 font-black uppercase text-xs py-3 rounded-lg"
          >
            {submitting ? 'Working...' : mode === 'register' ? 'Create private account' : 'Log in'}
          </button>
        </form>
      </section>
    </main>
  );
}

// ======================= COMPONENT SUB-ROUTINES =======================

interface FigmaFrameProps {
  frameId: string;
  activeCasinoTab: string;
  setActiveCasinoTab: (v: string) => void;
  user: UserProfile;
  onUpdateWallet: (v: number) => void;
  onTriggerNotification: (m: string, t: 'success' | 'info' | 'error') => void;
  claimDailySpins: () => void;
  onClaimWelcomeMatch: () => void;
  supportForm: any;
  setSupportForm: any;
  supportSubmitted: boolean;
  onSupportSubmit: (e: any) => void;
  gdprChecked: boolean;
  setGdprChecked: (v: boolean) => void;
  sessionTimeoutInput: string;
  setSessionTimeoutInput: (v: string) => void;
  registeredAgeChecked: boolean;
  setRegisteredAgeChecked: (v: boolean) => void;
  filteredGames: GameCatalogItem[];
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  filterVolatility: string;
  setFilterVolatility: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onRunInteractive: () => void;
}

function FigmaRenderFrame({
  frameId,
  user,
  onUpdateWallet,
  onTriggerNotification,
  claimDailySpins,
  onClaimWelcomeMatch,
  supportForm,
  setSupportForm,
  supportSubmitted,
  onSupportSubmit,
  gdprChecked,
  setGdprChecked,
  sessionTimeoutInput,
  setSessionTimeoutInput,
  registeredAgeChecked,
  setRegisteredAgeChecked,
  filteredGames,
  filterCategory,
  setFilterCategory,
  filterVolatility,
  setFilterVolatility,
  searchQuery,
  setSearchQuery,
  onRunInteractive
}: FigmaFrameProps) {

  // Global layout indicators wrapper for easy mock Inspect layout styling
  const runNotice = (
    <div className="m-4 bg-[#FF0055]/10 border border-[#FF0055]/30 p-3 rounded-lg flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-[#FF0055] animate-ping" />
        <span className="text-neutral-300">This is a Figma inspectable Layout. Try running the real action live!</span>
      </div>
      <button
        onClick={onRunInteractive}
        className="bg-gradient-to-r from-[#FF0055] to-purple-600 text-white font-black text-[9px] uppercase px-3 py-1.5 rounded"
      >
        Run Interactive App Demo
      </button>
    </div>
  );

  switch (frameId) {
    case 'landing':
      return (
        <div className="space-y-5 p-5">
          {runNotice}
          {/* Header */}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Vegas Neon Landing Desk</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 01</span>
          </div>

          {/* Hero Carousel mockup */}
          <div className="bg-gradient-to-r from-neutral-900 to-purple-950/40 p-6 rounded-xl border border-neutral-800 space-y-3 relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 opacity-5 w-44 h-44 bg-pink-500 rounded-full blur-3xl" />
            <span className="bg-[#FF0055] text-white text-[8px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">Promo carousel</span>
            <h4 className="text-lg font-black uppercase text-white leading-tight">Match welcome bonus multiplier loaded instantly: 100% up to $500</h4>
            <p className="text-[11px] text-neutral-450">Deposit mock digital credentials sandbox to trigger instant match matching values.</p>
            <button className="bg-[#00FF88] text-neutral-950 font-black text-[10px] px-3.5 py-1.5 rounded uppercase leading-none">Claim promo credits</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* VIP cashback */}
            <div className="bg-[#10101C] p-4 rounded-xl border border-neutral-850/60 text-left space-y-2">
              <span className="text-[9px] font-mono uppercase text-[#FF0055]">Progress Tier Highlight</span>
              <h5 className="text-xs font-bold text-white uppercase">15% Weekly Cashback</h5>
              <p className="text-[10px] text-neutral-400">Bronze through Silver progress bars unlocked dynamically.</p>
            </div>

            {/* Daily spins no deposit */}
            <div className="bg-[#10101C] p-4 rounded-xl border border-neutral-850/60 text-left space-y-2">
              <span className="text-[9px] font-mono uppercase text-[#00FF88]">Daily Bonus spec</span>
              <h5 className="text-xs font-bold text-white uppercase">50 Daily Free spins</h5>
              <p className="text-[10px] text-neutral-400">Collect non-deposit daily spins resetting credentials base.</p>
            </div>
          </div>

          {/* Catalog selector outline */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase text-neutral-300">Game Lobby catalog Matrix</span>
              <span className="text-[9px] text-[#00FF88] font-mono">4-Column grid standards</span>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {filteredGames.slice(0, 4).map(g => (
                <div key={g.id} className="bg-neutral-950 p-3 rounded-lg border border-neutral-850/60 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-xl">{g.img}</span>
                    <span className="text-[8px] font-mono text-neutral-500">{g.rtp}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-white block truncate">{g.title}</span>
                    <span className="text-[8px] text-[#FF0055] font-mono block">{g.provider}</span>
                  </div>
                  <div className="flex justify-between text-[8px] font-mono text-neutral-500">
                    <span>Volt: {g.volatility}</span>
                    <span className="text-yellow-500">{g.winOdds}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'catalog':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Extended Game Catalog Grid</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 02</span>
          </div>

          <div className="flex gap-2.5 items-center bg-neutral-950 p-2.5 rounded-lg border border-neutral-850">
            <span className="text-[9px] text-neutral-500 font-bold uppercase">Search:</span>
            <input
              type="text"
              readOnly
              placeholder="Filt: slots, live casino, poker, roulette, etc."
              className="bg-neutral-900 text-[10px] py-1 px-2 rounded border border-neutral-80 w-full"
            />
          </div>

          {/* Layout Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {GAME_CATALOG_DATA.slice(0, 6).map(g => (
              <div key={g.id} className="bg-[#10101C] border border-[#FF0055]/10 rounded-lg p-2.5 text-center">
                <span className="text-xl block mb-1">{g.img}</span>
                <span className="text-[10px] text-white font-bold block truncate">{g.title}</span>
                <span className="text-[8px] text-neutral-500 font-mono block uppercase">{g.provider}</span>
                <div className="mt-1 flex justify-between text-[8px] font-mono text-[#00FF88] px-1 bg-neutral-950 p-1 rounded mt-2">
                  <span>RTP: {g.rtp}</span>
                  <span>{g.volatility}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'slots':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Slots Game Screen Layout</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 03</span>
          </div>

          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-850 text-center space-y-4">
            <div className="text-[10px] font-mono text-neutral-400">Slot machine interface (5 reels, 3 rows)</div>
            {/* Reel representation mockup */}
            <div className="grid grid-cols-5 gap-1 bg-neutral-900 p-2.5 rounded-lg border border-neutral-80 font-mono text-lg text-emerald-400 font-bold">
              <span>🍒</span>
              <span>🍋</span>
              <span>⭐</span>
              <span>🍇</span>
              <span>💎</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-xs text-yellow-500 font-mono">Current Bet: $5.00</span>
              <button className="bg-[#00FF88] text-neutral-950 font-black px-4 py-1.5 rounded uppercase text-[10px]">Spin Reels</button>
            </div>
          </div>
        </div>
      );

    case 'blackjack':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Blackjack Game Layout</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 04</span>
          </div>

          <div className="bg-[#022c22] p-5 rounded-xl border border-emerald-500/20 text-center space-y-4">
            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Vegas Neon Blackjack felt</div>
            <div className="flex justify-around">
              <div>
                <span className="text-[9px] text-neutral-400 uppercase block">Dealer Hand (Show 10)</span>
                <div className="bg-white text-black p-1.5 rounded border shadow text-xs inline-block font-mono mt-1">
                  🃊 A
                </div>
              </div>

              <div>
                <span className="text-[9px] text-neutral-400 uppercase block">Player Hand (Score 19)</span>
                <div className="bg-white text-black p-1.5 rounded border shadow text-xs inline-block font-mono mt-1">
                  🂹 J
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-1.5">
              {['Hit', 'Stand', 'Double', 'Split'].map(a => (
                <span key={a} className="bg-neutral-950 text-neutral-300 font-bold text-[9px] px-2.5 py-1 rounded border border-neutral-80 uppercase">
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      );

    case 'roulette':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Roulette Game Layout</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 05</span>
          </div>

          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-850 space-y-3">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">European layout with roulette wheel spins list</span>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full border-4 border-neutral-80 border-dashed flex items-center justify-center font-bold text-xs">
                🎡 Wheel
              </div>
              <div className="flex-1 space-y-1.5">
                <span className="text-[9px] text-neutral-400 uppercase block">Wagers Placed:</span>
                <div className="flex gap-1.5">
                  <span className="bg-red-600 px-1.5 py-0.5 rounded text-[10px] font-mono text-white">RED ($25)</span>
                  <span className="bg-neutral-80 px-1.5 py-0.5 rounded text-[10px] font-mono text-white">Even ($10)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'poker':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Texas Hold'em Poker Screen</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 06</span>
          </div>

          <div className="bg-[#022c22] p-5 rounded-xl border border-emerald-500/20 text-center space-y-4">
            <div className="bg-yellow-500/15 border border-yellow-500/20 text-[10px] py-1 rounded inline-block text-yellow-500 px-3 uppercase font-bold">
              Pot size: $120
            </div>

            <div className="text-left space-y-2">
              <span className="text-[9px] uppercase font-bold text-neutral-300 block">Community cards (5 total):</span>
              <div className="flex gap-1.5">
                {['🃁', '🃎', '🂾', '🃏', '🂻'].map((c, i) => (
                  <span key={i} className="bg-white text-black p-1 rounded font-mono text-xs">{c}</span>
                ))}
              </div>
            </div>

            <div className="flex justify-center gap-2">
              {['Raise', 'Fold', 'Call', 'Check'].map(action => (
                <span key={action} className="bg-neutral-950 text-neutral-300 px-2 py-1 text-[9px] font-bold rounded uppercase">
                  {action}
                </span>
              ))}
            </div>
          </div>
        </div>
      );

    case 'profile':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">User Profile & Session statistics</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 07</span>
          </div>

          <div className="bg-[#10101C] p-4 rounded-xl border border-neutral-850/60 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎰</span>
              <div>
                <span className="text-xs font-bold text-white block uppercase">NeonGambler18</span>
                <span className="text-[9px] text-[#00FF88] uppercase font-mono mt-0.5 block">VIP Platinum rank</span>
              </div>
            </div>

            <div className="border-t border-neutral-80 pt-3 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="bg-neutral-950 p-2 rounded">
                <span className="text-[9px] text-neutral-500">Highest Win</span>
                <span className="block text-yellow-500 mt-0.5">$350</span>
              </div>

              <div className="bg-neutral-950 p-2 rounded">
                <span className="text-[9px] text-neutral-500">Total Spins</span>
                <span className="block text-[#00FF88] mt-0.5">42</span>
              </div>
            </div>
          </div>
        </div>
      );

    case 'wallet':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-850 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Financial Wallet Desk</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 08</span>
          </div>

          <div className="bg-[#10101C] p-4 rounded-xl border border-neutral-850/60 space-y-3">
            <div className="bg-neutral-950 p-3 rounded-lg text-center">
              <span className="text-[9px] text-neutral-500 font-bold uppercase block">Current reserves</span>
              <span className="text-lg font-mono font-black text-[#00FF88] block mt-0.5">${user.walletBalance}</span>
            </div>

            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold text-neutral-400 block">Payment methods:</span>
              <div className="grid grid-cols-3 gap-1.5 text-center text-[8px] uppercase">
                <div className="bg-neutral-955 p-1.5 border border-neutral-800 rounded font-bold text-neutral-350">Credit Cards</div>
                <div className="bg-neutral-955 p-1.5 border border-neutral-800 rounded font-bold text-neutral-350">Cryptos BTC</div>
                <div className="bg-neutral-955 p-1.5 border border-neutral-800 rounded font-bold text-neutral-350">Bank Wire</div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'bonuses':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Bonuses & Promotions news</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 09</span>
          </div>

          <div className="bg-[#10101C] p-4 rounded-xl border border-pink-700/20 space-y-3">
            <span className="bg-[#FF0055] text-white text-[9px] px-1.5 rounded uppercase font-bold">Promotion Specced</span>
            <h4 className="text-xs font-black uppercase text-white leading-tight">Match Welcome Bonus match: 100% up to $500</h4>
            <p className="text-[10px] text-neutral-450 leading-relaxed">Deposit mock digital credentials sandbox to trigger match multiplier rewards.</p>
          </div>
        </div>
      );

    case 'vip':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-85 pb-3">
            <span className="text-xs font-black text-neutral-200 uppercase tracking-widest">VIP Club Tier corridors</span>
            <span className="text-[9px] font-mono text-neutral-550 uppercase">Page 10</span>
          </div>

          <div className="bg-[#10101C] p-4 rounded-xl border border-purple-500/20 space-y-3">
            <div className="text-center">
              <span className="text-[9px] text-purple-400 font-bold block uppercase">Bronze &rarr; Gold Progress</span>
              <div className="h-1.5 w-full bg-neutral-950 rounded-full mt-1 overflow-hidden">
                <div className="h-full w-2/3 bg-purple-600" />
              </div>
            </div>
            <ul className="text-[10px] text-neutral-450 space-y-1 list-disc list-inside">
              <li>15% Weekly Cashbacks on slots</li>
              <li>Priority support validations enabled</li>
            </ul>
          </div>
        </div>
      );

    case 'live':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Live Dealer Lobby Streams</span>
            <span className="text-[9px] font-mono text-neutral-550 uppercase">Page 11</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-850/65 text-center">
              <span className="text-xl block">👩‍💼</span>
              <span className="text-[10px] text-white font-bold block mt-1">Live Emerald Blackjack</span>
              <span className="text-[9px] text-neutral-500 block leading-none">Audience: 142 online</span>
            </div>

            <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-850/65 text-center">
              <span className="text-xl block">🎡</span>
              <span className="text-[10px] text-white font-bold block mt-1">Live Fortune Roulette</span>
              <span className="text-[9px] text-neutral-500 block leading-none">Audience: 389 online</span>
            </div>
          </div>
        </div>
      );

    case 'support':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Support center faq</span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Page 12</span>
          </div>

          <div className="bg-[#10101C] p-4 rounded-xl border border-neutral-800 space-y-3">
            <span className="text-[10px] uppercase font-black text-[#FF0055]">Validated Feedback center</span>
            <div className="space-y-1.5 text-[10px]">
              <div>Name: <span className="text-neutral-400">Cleon VIP</span></div>
              <div>Email: <span className="text-neutral-400">cleon@registered.com</span></div>
              <div className="border-t border-neutral-80 pt-1 text-neutral-450 italic">
                "Verified deposit limits calculation queries resolved standard."
              </div>
            </div>
          </div>
        </div>
      );

    case 'blog':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Strategy Guidelines blog</span>
            <span className="text-[9px] font-mono text-neutral-550 uppercase">Page 13</span>
          </div>

          <div className="bg-[#10101C] p-3 rounded-lg border border-neutral-850 space-y-2">
            <span className="bg-neutral-950 text-purple-400 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded italic">Strategy Guidelines</span>
            <h5 className="text-[10px] font-bold text-white uppercase leading-snug">RTP Calculation systems explained</h5>
            <p className="text-[10px] text-neutral-450 leading-relaxed">Calculate high-volatility slots frequencies over long wagering session windows.</p>
          </div>
        </div>
      );

    case 'settings':
      return (
        <div className="space-y-4 p-5">
          {runNotice}
          <div className="flex justify-between items-center border-b border-neutral-80 pb-3">
            <span className="text-xs font-black text-neutral-200 uppercase tracking-widest">Settings / Safety Limits</span>
            <span className="text-[9px] font-mono text-neutral-550 uppercase">Page 14</span>
          </div>

          <div className="bg-[#10101C] p-4 rounded-xl border border-neutral-850 space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-300">Privacy GDPR toggle checked</span>
              <span className="text-[#00FF88] font-bold">Active</span>
            </div>

            <div className="flex justify-between text-xs">
              <span className="text-neutral-300">Age limit compliance checks (18+)</span>
              <span className="text-[#00FF88] font-bold">Verified</span>
            </div>
          </div>
        </div>
      );

    case 'components-library':
      return (
        <div className="space-y-5 p-5">
          <div className="flex justify-between items-center border-b border-neutral-85 pb-3">
            <span className="text-sm font-black text-white uppercase tracking-wider">Atomic Component Library Node</span>
            <span className="text-[8px] font-mono text-neutral-500 uppercase">FIGMA SYMBOLS</span>
          </div>

          {/* Buttons Library */}
          <div className="space-y-2">
            <span className="text-[9px] uppercase font-mono text-neutral-550 block">Buttons Block:</span>
            <div className="flex flex-wrap gap-2.5">
              <button className="bg-[#00FF88] text-neutral-950 font-black text-[10px] uppercase tracking-wider py-2 px-4 rounded shadow">
                🟢 Primary accent
              </button>
              <button className="bg-[#FF0055] text-white font-bold text-[10px] uppercase tracking-wider py-2 px-4 rounded shadow">
                💗 Secondary Pink accents
              </button>
              <button className="bg-red-600 text-white font-bold text-[10px] uppercase tracking-wider py-2 px-4 rounded shadow">
                🚫 Danger / Reset
              </button>
            </div>
          </div>

          {/* Badge Volatility variants */}
          <div className="space-y-2">
            <span className="text-[9px] uppercase font-mono text-neutral-550 block">Dynamic Badges:</span>
            <div className="flex gap-2">
              <span className="bg-neutral-900 text-[#00FF88] border border-neutral-800 text-[8px] font-bold px-2 py-0.5 rounded font-mono">
                99.5% RTP Verified
              </span>
              <span className="bg-purple-950 text-purple-400 border border-purple-500/20 text-[8px] font-bold px-2 py-0.5 rounded">
                Extreme Volatility
              </span>
            </div>
          </div>

          {/* Inputs UI mockups */}
          <div className="space-y-2">
            <span className="text-[9px] uppercase font-mono text-neutral-550 block">Pre-shaped input field:</span>
            <input
              type="text"
              readOnly
              placeholder="Glow outline placeholder text..."
              className="w-full bg-neutral-900 border border-[#FF0055]/30 rounded-lg p-2 text-[10px] focus:outline-none"
            />
          </div>
        </div>
      );

    default:
      return (
        <div className="p-8 text-center text-neutral-450 text-xs">
          Select frame layer in the sidebar to inspect layout parameters.
        </div>
      );
  }
}

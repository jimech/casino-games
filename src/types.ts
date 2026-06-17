/**
 * Type declarations for the Vegas Neon Casino Applet
 */

export interface UserProfile {
  username: string;
  avatar: string;
  vipTier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
  walletBalance: number; // in mock USD
  isVip: boolean;
  totalSpins: number;
  totalBlackjackWins: number;
  totalRouletteWins: number;
  totalPokerWins: number;
  totalCrashWins: number;
  biggestWin: number;
  joinedDate: string;
  dailyStreak: number;
  lastDailyClaim: string | null;
  freeSpinsLeft: number;
}

export type CasinoGameType = 'slots' | 'blackjack' | 'roulette' | 'poker' | 'crash' | 'live';

export interface GameCatalogItem {
  id: string;
  title: string;
  category: CasinoGameType;
  provider: string;
  rtp: string;
  volatility: 'Low' | 'Medium' | 'High' | 'Extreme';
  img: string;
  description: string;
  winOdds: string;
}

export interface SlotMachineConfig {
  id: string;
  name: string;
  rtp: number;
  reelsCount: number;
  volatility: 'Low' | 'Medium' | 'High';
  symbols: { char: string; color: string; value: number }[];
  minBet: number;
  maxBet: number;
}

export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string; // '2'-'10', 'J', 'Q', 'K', 'A'
  score: number;
}

export interface RouletteBets {
  red?: number;
  black?: number;
  even?: number;
  odd?: number;
  numberBets: { [num: number]: number };
}

export interface PokerPlayer {
  name: string;
  chips: number;
  currentBet: number;
  cards: Card[];
  isDealerResponse: boolean;
  folded: boolean;
  actionStatus: string;
}

export interface BlogPost {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  date: string;
  author: string;
}

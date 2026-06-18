import React, { useState } from 'react';
import { Trophy } from 'lucide-react';
import { sound } from '../utils/audio';
import { UserProfile, Card } from '../types';
import {
  PlayingCard,
  comparePokerHands,
  evaluateBestTexasHoldemHand
} from '../domain/poker';

interface PokerGameProps {
  user: UserProfile;
  onUpdateWallet: (amount: number) => void;
  onStartRound?: (ante: number) => Promise<PokerServerView>;
  onActionRound?: (roundId: string, action: 'check' | 'call' | 'raise' | 'fold') => Promise<PokerServerView>;
  onTriggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

interface PokerServerView {
  roundId: string;
  stage: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'folded';
  playerCards: [PlayingCard, PlayingCard];
  dealerCards: PlayingCard[];
  dealerCardsHidden: boolean;
  communityCards: PlayingCard[];
  pot: number;
  playerContribution: number;
  dealerContribution: number;
  dealerActionStatus: string;
  playerRank?: { category: string };
  dealerRank?: { category: string };
  winner?: 'player' | 'dealer' | 'push';
  payout?: number;
}

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const VALUES = [
  { val: '2', score: 2 }, { val: '3', score: 3 }, { val: '4', score: 4 }, { val: '5', score: 5 },
  { val: '6', score: 6 }, { val: '7', score: 7 }, { val: '8', score: 8 }, { val: '9', score: 9 },
  { val: '10', score: 10 }, { val: 'J', score: 11 }, { val: 'Q', score: 12 }, { val: 'K', score: 13 },
  { val: 'A', score: 14 }
];

const toPlayingCard = (card: Card): PlayingCard => ({
  suit: card.suit,
  rank: card.value as PlayingCard['rank']
});

const fromPlayingCard = (card: PlayingCard): Card => ({
  suit: card.suit,
  value: card.rank,
  score: card.rank === 'A' ? 14 : ['K', 'Q', 'J'].includes(card.rank) ? { K: 13, Q: 12, J: 11 }[card.rank as 'K' | 'Q' | 'J'] : Number(card.rank)
});

export default function PokerGame({ user, onUpdateWallet, onStartRound, onActionRound, onTriggerNotification }: PokerGameProps) {
  const [deck, setDeck] = useState<Card[]>([]);
  const [pot, setPot] = useState(0);

  // Betting Stakes
  const [ante, setAnte] = useState(10);
  const [currentCallBet, setCurrentCallBet] = useState(0);
  const [playerCurrentBet, setPlayerCurrentBet] = useState(0);

  // Cards
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);

  // States
  const [gameStarted, setGameStarted] = useState(false);
  const [gameStage, setGameStage] = useState<'preflop' | 'flop' | 'turn' | 'river' | 'showdown'>('preflop');
  const [dealerActionStatus, setDealerActionStatus] = useState('Waiting');
  const [winnerMessage, setWinnerMessage] = useState('');
  const [serverRoundId, setServerRoundId] = useState<string | null>(null);

  const initDeck = () => {
    let d: Card[] = [];
    for (const suit of SUITS) {
      for (const item of VALUES) {
        d.push({ suit, value: item.val, score: item.score });
      }
    }
    // Shuffle
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    setDeck(d);
    return d;
  };

  const applyServerView = (view: PokerServerView) => {
    setServerRoundId(view.roundId);
    setPlayerCards(view.playerCards.map(fromPlayingCard));
    setDealerCards(view.dealerCards.map(fromPlayingCard));
    setCommunityCards(view.communityCards.map(fromPlayingCard));
    setPot(view.pot);
    setPlayerCurrentBet(view.playerContribution);
    setCurrentCallBet(view.playerContribution);
    setDealerActionStatus(view.dealerActionStatus);
    setGameStage(view.stage === 'folded' ? 'showdown' : view.stage);
    setGameStarted(view.stage !== 'showdown' && view.stage !== 'folded');

    if (view.stage === 'showdown' || view.stage === 'folded') {
      if (view.winner === 'player') {
        sound.playBigWin();
        setWinnerMessage(`👑 PLAYER WINS POT OF $${view.payout ?? 0}! ${view.playerRank?.category ?? 'Best hand'} beats Dealer: ${view.dealerRank?.category ?? 'hand'}!`);
        onTriggerNotification("Congratulations! You won the poker showdown!", "success");
      } else if (view.winner === 'push') {
        setWinnerMessage(`⚖️ SPLIT POT Push! Refunded $${view.payout ?? 0}.`);
        onTriggerNotification("Poker push. Split pot returned.", "info");
      } else {
        sound.playError();
        setWinnerMessage(view.stage === 'folded'
          ? "You folded. Dealer takes the remaining accumulated pot."
          : `❌ DEALER WINS! Dealer ${view.dealerRank?.category ?? 'hand'} beats your ${view.playerRank?.category ?? 'hand'}!`);
        onTriggerNotification("Dealer won this poker round.", "error");
      }
    } else {
      setWinnerMessage('');
    }
  };

  const handleStartGame = async () => {
    sound.playClick();
    if (user.walletBalance < ante) {
      sound.playError();
      onTriggerNotification("Insufficient wallet funds for the Poker Ante stake!", "error");
      return;
    }

    if (onStartRound) {
      try {
        sound.playDeal();
        const view = await onStartRound(ante);
        applyServerView(view);
      } catch (error) {
        sound.playError();
        onTriggerNotification(error instanceof Error ? error.message : "Poker deal failed.", "error");
      }
      return;
    }

    onUpdateWallet(-ante);
    sound.playDeal();

    const freshDeck = initDeck();
    const p1 = freshDeck.pop()!;
    const d1 = freshDeck.pop()!;
    const p2 = freshDeck.pop()!;
    const d2 = freshDeck.pop()!;

    setPlayerCards([p1, p2]);
    setDealerCards([d1, d2]);
    setCommunityCards([]);
    setDeck(freshDeck);

    setPot(ante * 2);
    setPlayerCurrentBet(ante);
    setCurrentCallBet(ante);

    setGameStage('preflop');
    setGameStarted(true);
    setWinnerMessage('');
    setDealerActionStatus('Checked standard blind');
  };

  const getHandDesc = () => {
    if (playerCards.length === 0) return '';
    if (communityCards.length < 5) return 'Pending board';
    return evaluateBestTexasHoldemHand(
      playerCards.map(toPlayingCard),
      communityCards.map(toPlayingCard)
    ).category;
  };

  // Check state
  const handleCheck = () => {
    if (onActionRound && serverRoundId) {
      void runServerAction('check');
      return;
    }
    sound.playClick();
    executeStageProgression();
  };

  // Call state
  const handleCall = () => {
    if (onActionRound && serverRoundId) {
      void runServerAction('call');
      return;
    }
    const callDiff = currentCallBet - playerCurrentBet;
    let cost = Math.max(0, callDiff);
    if (cost > 0) {
      if (user.walletBalance < cost) {
        sound.playError();
        onTriggerNotification("Insufficient wallet funds to match the current Call bet!", "error");
        return;
      }
      onUpdateWallet(-cost);
      setPot(prev => prev + cost);
      setPlayerCurrentBet(prev => prev + cost);
    }
    sound.playClick();
    executeStageProgression();
  };

  // Raise option
  const handleRaise = () => {
    if (onActionRound && serverRoundId) {
      void runServerAction('raise');
      return;
    }
    sound.playClick();
    const raiseAmount = 20; // fixed increment raise
    const totalStake = (currentCallBet - playerCurrentBet) + raiseAmount;

    if (user.walletBalance < totalStake) {
      sound.playError();
      onTriggerNotification("Insufficient coins to raise this hands stakes limit!", "error");
      return;
    }

    onUpdateWallet(-totalStake);
    setPot(prev => prev + totalStake + raiseAmount); // Dealer will match immediately (simulated)
    setPlayerCurrentBet(prev => prev + totalStake);
    setCurrentCallBet(prev => prev + raiseAmount);

    setDealerActionStatus("Dealer matched Raise content!");
    onTriggerNotification(`You raised the pot by +$${raiseAmount}!`, "success");

    executeStageProgression();
  };

  // Fold Option
  const handleFold = () => {
    if (onActionRound && serverRoundId) {
      void runServerAction('fold');
      return;
    }
    sound.playClick();
    sound.playError();
    setGameStarted(false);
    onTriggerNotification("You folded. Dealer takes the remaining accumulated pot.", "info");
  };

  const runServerAction = async (action: 'check' | 'call' | 'raise' | 'fold') => {
    if (!serverRoundId || !onActionRound) return;
    try {
      sound.playClick();
      const view = await onActionRound(serverRoundId, action);
      applyServerView(view);
    } catch (error) {
      sound.playError();
      onTriggerNotification(error instanceof Error ? error.message : `Poker ${action} failed.`, "error");
    }
  };

  const executeStageProgression = () => {
    let nextDeck = [...deck];
    sound.playDeal();

    if (gameStage === 'preflop') {
      // Burn 1, deal card flop (3 cards)
      nextDeck.pop();
      const f1 = nextDeck.pop()!;
      const f2 = nextDeck.pop()!;
      const f3 = nextDeck.pop()!;
      setCommunityCards([f1, f2, f3]);
      setDeck(nextDeck);
      setGameStage('flop');
      setDealerActionStatus(Math.random() > 0.4 ? 'Checks' : 'Bet $10');
    } else if (gameStage === 'flop') {
      // Deal card turn (1 card)
      nextDeck.pop();
      const t = nextDeck.pop()!;
      setCommunityCards(prev => [...prev, t]);
      setDeck(nextDeck);
      setGameStage('turn');
      setDealerActionStatus(Math.random() > 0.5 ? 'Checks' : 'Call checked');
    } else if (gameStage === 'turn') {
      // Deal card river (1 card)
      nextDeck.pop();
      const r = nextDeck.pop()!;
      setCommunityCards(prev => [...prev, r]);
      setDeck(nextDeck);
      setGameStage('river');
      setDealerActionStatus('Checks the River card');
    } else if (gameStage === 'river') {
      // Showdown evaluate
      setGameStage('showdown');
      evaluateShowdownWinner();
    }
  };

  const evaluateShowdownWinner = () => {
    const pStrength = evaluateBestTexasHoldemHand(
      playerCards.map(toPlayingCard),
      communityCards.map(toPlayingCard)
    );
    const dStrength = evaluateBestTexasHoldemHand(
      dealerCards.map(toPlayingCard),
      communityCards.map(toPlayingCard)
    );
    const comparison = comparePokerHands(pStrength, dStrength);

    let winnerLog = '';
    if (comparison > 0) {
      // Player wins
      sound.playBigWin();
      onUpdateWallet(pot);
      winnerLog = `👑 PLAYER WINS POT OF $${pot}! ${pStrength.category} beats Dealer: ${dStrength.category}!`;
      onTriggerNotification("Congratulations! You won the poker showdown!", "success");
    } else if (comparison < 0) {
      // Dealer wins
      sound.playError();
      winnerLog = `❌ DEALER WINS! Dealer ${dStrength.category} beats your ${pStrength.category}!`;
      onTriggerNotification("Dealer won this showdown round.", "error");
    } else {
      // Push - split pot
      const refund = Math.floor(pot / 2);
      onUpdateWallet(refund);
      winnerLog = `⚖️ SPLIT POT Push! Both hands scored ${pStrength.category}. Refunded $${refund}.`;
    }
    setWinnerMessage(winnerLog);
  };

  const getSuitSymbol = (suit: Card['suit']) => {
    switch (suit) {
      case 'hearts': return { s: '♥', c: 'text-red-500' };
      case 'diamonds': return { s: '♦', c: 'text-red-500' };
      case 'clubs': return { s: '♣', c: 'text-neutral-300' };
      case 'spades': return { s: '♠', c: 'text-neutral-300' };
    }
  };

  return (
    <div id="poker_tex_holdem_wrapper" className="space-y-6">
      <div className="relative bg-[#022c22] rounded-3xl border border-emerald-500/20 p-6 md:p-8 overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.04)_0%,transparent_80%)] pointer-events-none" />

        {/* Felt board branding */}
        <div className="absolute inset-x-0 top-1/3 text-center pointer-events-none select-none">
          <span className="text-emerald-800/15 text-xs font-black uppercase tracking-[0.3em] block">
            Hold'em Pro Diamond Arena
          </span>
          <span className="text-emerald-800/10 text-[9px] uppercase tracking-wider block mt-0.5">
            RNG certified computer AI dealer
          </span>
        </div>

        {/* Dynamic score summary */}
        {winnerMessage && (
          <div className="animate-bounce bg-neutral-950/90 border-2 border-yellow-500 text-yellow-500 font-extrabold text-xs text-center py-3 px-4 rounded-xl mb-6 relative z-10">
            {winnerMessage}
          </div>
        )}

        {/* AI DEALER ROW */}
        <div className="text-center mb-10 relative z-10">
          <div className="inline-flex items-center gap-2 bg-neutral-950/80 border border-neutral-800 px-3 py-1 rounded-full text-xs text-neutral-300 mb-2">
            <span>💻 Dealer AI Status:</span>
            <span className="text-emerald-400 font-bold">{dealerActionStatus}</span>
          </div>

          <div className="flex justify-center gap-2 min-h-[96px]">
            {playerCards.length > 0 ? (
              <>
                {/* Dealer hole cards shown only at showdown */}
                <div className={`w-16 h-24 rounded-lg border flex flex-col justify-between p-1.5 shadow-md ${
                  gameStage === 'showdown' ? 'bg-white border-neutral-300' : 'bg-gradient-to-br from-emerald-600 to-green-950 border-emerald-400'
                }`}>
                  {gameStage === 'showdown' ? (
                    <>
                      <div className="text-xs font-bold text-black leading-none">{dealerCards[0].value}</div>
                      <div className={`text-xl self-center leading-none ${getSuitSymbol(dealerCards[0].suit).c}`}>{getSuitSymbol(dealerCards[0].suit).s}</div>
                      <div className="text-xs font-bold text-black leading-none self-end scale-x-[-1] scale-y-[-1]">{dealerCards[0].value}</div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-emerald-300 font-bold">💎</div>
                  )}
                </div>

                <div className={`w-16 h-24 rounded-lg border flex flex-col justify-between p-1.5 shadow-md ${
                  gameStage === 'showdown' ? 'bg-white border-neutral-300' : 'bg-gradient-to-br from-emerald-600 to-green-950 border-emerald-400'
                }`}>
                  {gameStage === 'showdown' ? (
                    <>
                      <div className="text-xs font-bold text-black leading-none">{dealerCards[1].value}</div>
                      <div className={`text-xl self-center leading-none ${getSuitSymbol(dealerCards[1].suit).c}`}>{getSuitSymbol(dealerCards[1].suit).s}</div>
                      <div className="text-xs font-bold text-black leading-none self-end scale-x-[-1] scale-y-[-1]">{dealerCards[1].value}</div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-emerald-300 font-bold">💎</div>
                  )}
                </div>
              </>
            ) : (
              <div className="w-16 h-24 border-2 border-dashed border-emerald-900/30 rounded-lg flex items-center justify-center text-xs text-emerald-700">Awaiting</div>
            )}
          </div>
        </div>

        {/* POT & COMMUNITY CARDS SECTION */}
        <div className="flex flex-col items-center justify-center gap-4 mb-10 relative z-10 border-y border-emerald-900/20 py-4">
          <div className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-500 font-black text-xs px-4 py-1.5 rounded-full uppercase tracking-wider">
            Pot size: <span className="text-white font-mono font-bold">${pot}</span>
          </div>

          <div className="flex justify-center gap-2.5 min-h-[96px]">
            {communityCards.map((card, idx) => {
              const sym = getSuitSymbol(card.suit);
              return (
                <div
                  key={idx}
                  className="animate-scaleUp w-16 h-24 bg-white border border-neutral-300 rounded-lg flex flex-col justify-between p-1.5 shadow-md"
                >
                  <div className="text-xs font-bold text-black leading-none">{card.value}</div>
                  <div className={`text-xl self-center leading-none ${sym.c}`}>{sym.s}</div>
                  <div className="text-xs font-bold text-black leading-none self-end scale-x-[-1] scale-y-[-1]">{card.value}</div>
                </div>
              );
            })}
            {communityCards.length === 0 && (
              <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-widest bg-emerald-950/20 px-3 py-1.5 rounded-lg">
                Pre-flop blind rounds
              </span>
            )}
          </div>
        </div>

        {/* PLAYER ROW */}
        <div className="text-center mb-6 relative z-10">
          <div className="inline-flex items-center gap-2 bg-neutral-950/80 border border-neutral-805 px-3 py-1 rounded-full text-xs text-neutral-300 mb-2">
            <span>👤 Your Hand:</span>
            {playerCards.length > 0 && (
              <span className="text-yellow-400 font-bold font-mono">{getHandDesc()}</span>
            )}
          </div>

          <div className="flex justify-center gap-2.5 min-h-[96px]">
            {playerCards.map((card, idx) => {
              const sym = getSuitSymbol(card.suit);
              return (
                <div
                  key={idx}
                  className="w-16 h-24 bg-white border border-neutral-300 rounded-lg flex flex-col justify-between p-1.5 shadow-md"
                >
                  <div className="text-xs font-bold text-black leading-none">{card.value}</div>
                  <div className={`text-xl self-center leading-none ${sym.c}`}>{sym.s}</div>
                  <div className="text-xs font-bold text-black leading-none self-end scale-x-[-1] scale-y-[-1]">{card.value}</div>
                </div>
              );
            })}
            {playerCards.length === 0 && (
              <div className="w-16 h-24 border-2 border-dashed border-emerald-900/30 rounded-lg flex items-center justify-center text-xs text-emerald-700">Awaiting...</div>
            )}
          </div>
        </div>

        {/* BOTTOM POKER ACTION COMMANDS */}
        <div className="relative bg-neutral-950/90 border border-neutral-850 p-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between z-10">
          {!gameStarted ? (
            <div className="w-full flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400 uppercase font-black">Ante Blind Cost:</span>
                <span className="bg-neutral-900 text-yellow-500 font-mono font-bold text-sm px-3.5 py-1.5 rounded border border-neutral-800">
                  ${ante}
                </span>
              </div>

              <button
                onClick={handleStartGame}
                className="w-full sm:w-auto bg-gradient-to-r from-yellow-400 via-yellow-500 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-neutral-950 font-black uppercase text-xs tracking-widest py-3 px-8 rounded-xl shadow-lg active:scale-95 transition-all cursor-pointer"
              >
                Place Ante & Deal Cards
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-wrap gap-2.5 justify-center">
              {gameStage !== 'showdown' && (
                <>
                  <button
                    onClick={handleCheck}
                    className="bg-neutral-900 hover:bg-neutral-800 text-neutral-200 py-2.5 px-6 rounded-lg font-bold text-xs uppercase cursor-pointer"
                  >
                    Check ✋
                  </button>
                  <button
                    onClick={handleCall}
                    className="bg-emerald-900 hover:bg-emerald-800 text-white py-2.5 px-6 rounded-lg font-bold text-xs uppercase cursor-pointer"
                  >
                    Call Match Bet
                  </button>
                  <button
                    onClick={handleRaise}
                    className="bg-yellow-600 hover:bg-yellow-500 text-white py-2.5 px-6 rounded-lg font-bold text-xs uppercase cursor-pointer"
                  >
                    Raise Stake +$20
                  </button>
                </>
              )}
              <button
                onClick={handleFold}
                className="bg-red-950 text-red-400 hover:bg-red-900 hover:text-white py-2.5 px-6 rounded-lg font-bold text-xs uppercase cursor-pointer"
              >
                Fold Card 🚫
              </button>
              {gameStage === 'showdown' && (
                <button
                  onClick={handleStartGame}
                  className="bg-yellow-500 hover:bg-yellow-400 text-neutral-950 py-2.5 px-6 rounded-lg font-black text-xs uppercase tracking-wide cursor-pointer animate-pulse"
                >
                  Start New Round
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Poker hands education accordion */}
      <div className="bg-neutral-900/30 border border-neutral-850 p-4 rounded-xl">
        <h4 className="text-xs font-black uppercase text-neutral-300 mb-2 flex items-center gap-1.5">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Poker Showdown Guide
        </h4>
        <p className="text-[11px] text-neutral-400 mb-3">
          Texas Hold'em pairs community board cards and hole cards to compile 5-card combinations:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 text-[10px] text-neutral-400">
          <div className="bg-neutral-950/60 p-2 rounded border border-neutral-850/40">
            <strong className="text-neutral-200 block">Straight Flush</strong> 5 cards sequential, of standard suit.
          </div>
          <div className="bg-neutral-950/60 p-2 rounded border border-neutral-850/40">
            <strong className="text-neutral-200 block">Four of a Kind</strong> 4 equivalent cards.
          </div>
          <div className="bg-neutral-950/60 p-2 rounded border border-neutral-850/40">
            <strong className="text-neutral-200 block">Full House</strong> 3 cards paired with 2 different matching cards.
          </div>
          <div className="bg-neutral-950/60 p-2 rounded border border-neutral-850/40">
            <strong className="text-neutral-200 block">Flush</strong> 5 cards of same suit.
          </div>
          <div className="bg-neutral-950/60 p-2 rounded border border-neutral-850/40">
            <strong className="text-neutral-200 block">Straight</strong> 5 cards of sequential values.
          </div>
        </div>
      </div>
    </div>
  );
}

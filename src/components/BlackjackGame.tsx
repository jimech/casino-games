import React, { useState, useEffect } from 'react';
import { Play, RotateCcw, TrendingUp } from 'lucide-react';
import { sound } from '../utils/audio';
import { UserProfile, Card } from '../types';
import {
  BlackjackCard,
  canSplitBlackjackHand,
  hiLoCountForCards,
  scoreBlackjackHand,
  settleBlackjackHand,
  shouldDealerDraw
} from '../domain/blackjack';
import { asMoney } from '../domain/money';

interface BlackjackGameProps {
  user: UserProfile;
  onUpdateWallet: (amount: number) => void;
  onStartRound?: (stake: number) => Promise<BlackjackServerView>;
  onActionRound?: (roundId: string, action: 'hit' | 'stand' | 'double' | 'split') => Promise<BlackjackServerView>;
  onTriggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

interface BlackjackServerView {
  roundId: string;
  phase: 'player' | 'settled';
  playerHand: BlackjackCard[];
  splitHand?: BlackjackCard[];
  activeHandIndex: 0 | 1;
  dealerHand: BlackjackCard[];
  dealerHoleHidden: boolean;
  playerScore: number;
  splitScore?: number;
  dealerScore?: number;
  runningCount: number;
  cardsPlayedCount: number;
  settlement?: {
    status: 'win' | 'lose' | 'push' | 'blackjack';
    payout: number;
    playerScore: number;
    dealerScore: number;
  };
  splitSettlement?: {
    status: 'win' | 'lose' | 'push' | 'blackjack';
    payout: number;
    playerScore: number;
    dealerScore: number;
  };
}

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const VALUES = [
  { val: '2', score: 2, countVal: 1 },
  { val: '3', score: 3, countVal: 1 },
  { val: '4', score: 4, countVal: 1 },
  { val: '5', score: 5, countVal: 1 },
  { val: '6', score: 6, countVal: 1 },
  { val: '7', score: 7, countVal: 0 },
  { val: '8', score: 8, countVal: 0 },
  { val: '9', score: 9, countVal: 0 },
  { val: '10', score: 10, countVal: -1 },
  { val: 'J', score: 10, countVal: -1 },
  { val: 'Q', score: 10, countVal: -1 },
  { val: 'K', score: 10, countVal: -1 },
  { val: 'A', score: 11, countVal: -1 }
];

type BlackjackUiStatus = 'playing' | 'stand' | 'busted' | 'blackjack' | 'win' | 'lose' | 'push' | 'doubled';

const toBlackjackCard = (card: Card): BlackjackCard => ({
  suit: card.suit,
  rank: card.value as BlackjackCard['rank']
});

const toBlackjackCards = (cards: readonly Card[]): BlackjackCard[] => cards.map(toBlackjackCard);

const fromBlackjackCard = (card: BlackjackCard): Card => ({
  suit: card.suit,
  value: card.rank,
  score: card.rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(card.rank) ? 10 : Number(card.rank)
});

export default function BlackjackGame({ user, onUpdateWallet, onStartRound, onActionRound, onTriggerNotification }: BlackjackGameProps) {
  const [deck, setDeck] = useState<Card[]>([]);
  const [bet, setBet] = useState(25);
  const [gameInProgress, setGameInProgress] = useState(false);

  // Hands
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [splitHand, setSplitHand] = useState<Card[] | null>(null);

  // States
  const [dealerTurn, setDealerTurn] = useState(false);
  const [activeHandIdx, setActiveHandIdx] = useState<0 | 1>(0); // 0 = main hand, 1 = split hand
  const [runningCount, setRunningCount] = useState(0);
  const [cardsPlayedCount, setCardsPlayedCount] = useState(0);
  const [serverRoundId, setServerRoundId] = useState<string | null>(null);

  // Game statuses
  const [mainHandStatus, setMainHandStatus] = useState<BlackjackUiStatus>('playing');
  const [splitHandStatus, setSplitHandStatus] = useState<BlackjackUiStatus>('playing');

  // Generate standard 6 decks and shuffle
  const initDeck = () => {
    let newDeck: Card[] = [];
    const deckCount = 6;
    for (let d = 0; d < deckCount; d++) {
      for (const suit of SUITS) {
        for (const item of VALUES) {
          newDeck.push({
            suit,
            value: item.val,
            score: item.score
          });
        }
      }
    }
    // Shuffle
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    setDeck(newDeck);
    setRunningCount(0);
    setCardsPlayedCount(0);
    return newDeck;
  };

  useEffect(() => {
    initDeck();
  }, []);

  const calculateHandScore = (hand: Card[]) => {
    return scoreBlackjackHand(toBlackjackCards(hand));
  };

  const updateCardCount = (cards: Card[]) => {
    const addedCount = hiLoCountForCards(toBlackjackCards(cards));
    setRunningCount(prev => prev + addedCount);
    setCardsPlayedCount(prev => prev + cards.length);
  };

  const handleBetChange = (amount: number) => {
    sound.playClick();
    setBet(Math.max(5, Math.min(1000, amount)));
  };

  // Start new game deal
  const applyServerView = (view: BlackjackServerView) => {
    setServerRoundId(view.roundId);
    setPlayerHand(view.playerHand.map(fromBlackjackCard));
    setSplitHand(view.splitHand ? view.splitHand.map(fromBlackjackCard) : null);
    setDealerHand(view.dealerHand.map(fromBlackjackCard));
    setActiveHandIdx(view.activeHandIndex);
    setDealerTurn(!view.dealerHoleHidden);
    setRunningCount(view.runningCount);
    setCardsPlayedCount(view.cardsPlayedCount);
    setGameInProgress(view.phase === 'player');
    setSplitHandStatus(view.splitHand ? 'playing' : 'playing');

    if (view.phase === 'player') {
      setMainHandStatus('playing');
      return;
    }

    const status = view.settlement?.status ?? 'lose';
    setMainHandStatus(status);
    if (view.splitSettlement) {
      setSplitHandStatus(view.splitSettlement.status);
    }
    if (status === 'lose') {
      sound.playError();
      onTriggerNotification(`Dealer wins with ${view.settlement?.dealerScore ?? view.dealerScore}.`, 'error');
    } else if (status === 'blackjack') {
      sound.playBigWin();
      onTriggerNotification(`BLACKJACK! Returned $${view.settlement?.payout ?? 0}.`, 'success');
    } else if (status === 'win') {
      sound.playWin();
      onTriggerNotification(`You won against Dealer! Returned $${view.settlement?.payout ?? 0}.`, 'success');
    } else {
      onTriggerNotification('Push round! Bet refunded.', 'info');
    }
  };

  const dealNewGame = async () => {
    if (user.walletBalance < bet) {
      sound.playError();
      onTriggerNotification("Insufficient coins to place Blackjack bet!", "error");
      return;
    }

    if (onStartRound) {
      try {
        sound.playDeal();
        const view = await onStartRound(bet);
        applyServerView(view);
      } catch (error) {
        sound.playError();
        onTriggerNotification(error instanceof Error ? error.message : "Blackjack deal failed.", "error");
      }
      return;
    }

    onUpdateWallet(-bet);
    sound.playDeal();

    // Reset hand states
    setSplitHand(null);
    setActiveHandIdx(0);
    setMainHandStatus('playing');
    setSplitHandStatus('playing');
    setDealerTurn(false);

    let activeDeck = [...deck];
    if (activeDeck.length < 20) {
      activeDeck = initDeck();
    }

    const pCard1 = activeDeck.pop()!;
    const dCard1 = activeDeck.pop()!;
    const pCard2 = activeDeck.pop()!;
    const dCard2 = activeDeck.pop()!; // down card initially hidden on screen

    setPlayerHand([pCard1, pCard2]);
    setDealerHand([dCard1, dCard2]);
    setDeck(activeDeck);

    // Update real-time count
    updateCardCount([pCard1, pCard2, dCard1]); // Dealer hole card is initially hidden from card counting until stand

    const pScore = calculateHandScore([pCard1, pCard2]);
    if (pScore === 21) {
      setMainHandStatus('blackjack');
      sound.playBigWin();
      // Auto stand onto dealer
      setDealerTurn(true);
      revealHoleCardAndExecuteDealer(dCard2, [pCard1, pCard2], 'blackjack');
    } else {
      setGameInProgress(true);
    }
  };

  // Hit command
  const hit = async () => {
    if (!gameInProgress) return;

    if (onActionRound && serverRoundId) {
      try {
        sound.playDeal();
        const view = await onActionRound(serverRoundId, 'hit');
        applyServerView(view);
      } catch (error) {
        sound.playError();
        onTriggerNotification(error instanceof Error ? error.message : "Blackjack hit failed.", "error");
      }
      return;
    }

    sound.playDeal();

    let activeDeck = [...deck];
    if (activeDeck.length < 5) return;

    const newCard = activeDeck.pop()!;
    updateCardCount([newCard]);

    if (activeHandIdx === 0) {
      const nextHand = [...playerHand, newCard];
      setPlayerHand(nextHand);
      setDeck(activeDeck);

      const score = calculateHandScore(nextHand);
      if (score > 21) {
        setMainHandStatus('busted');
        sound.playError();
        if (splitHand) {
          // Move to split hand active turn
          setActiveHandIdx(1);
          onTriggerNotification("Main hand Busted! Playing second hand.", "info");
        } else {
          // Lose immediately
          setGameInProgress(false);
          onTriggerNotification("You Busted over 21!", "error");
        }
      }
    } else {
      // Split hand active
      if (!splitHand) return;
      const nextHand = [...splitHand, newCard];
      setSplitHand(nextHand);
      setDeck(activeDeck);

      const score = calculateHandScore(nextHand);
      if (score > 21) {
        setSplitHandStatus('busted');
        sound.playError();
        // End user action
        evaluateSplitDealerDraw();
      }
    }
  };

  // Stand command
  const stand = async () => {
    if (!gameInProgress) return;

    if (onActionRound && serverRoundId) {
      try {
        sound.playClick();
        const view = await onActionRound(serverRoundId, 'stand');
        applyServerView(view);
      } catch (error) {
        sound.playError();
        onTriggerNotification(error instanceof Error ? error.message : "Blackjack stand failed.", "error");
      }
      return;
    }

    sound.playClick();

    if (activeHandIdx === 0 && splitHand) {
      // Stand first hand, move to split hand
      setActiveHandIdx(1);
      onTriggerNotification("Main hand stand. Action is now on the second hand.", "info");
    } else {
      // Reveal dealer hole card and start drawing
      setDealerTurn(true);
      const holeCard = dealerHand[1]; // card 2
      revealHoleCardAndExecuteDealer(holeCard, playerHand, 'stand');
    }
  };

  // Double down command
  const doubleDown = () => {
    if (!gameInProgress) return;
    if (onActionRound && serverRoundId) {
      void (async () => {
        try {
          sound.playDeal();
          const view = await onActionRound(serverRoundId, 'double');
          applyServerView(view);
        } catch (error) {
          sound.playError();
          onTriggerNotification(error instanceof Error ? error.message : "Blackjack double down failed.", "error");
        }
      })();
      return;
    }
    if (user.walletBalance < bet) {
      sound.playError();
      onTriggerNotification("Not enough virtual credentials to double down!", "error");
      return;
    }

    onUpdateWallet(-bet);
    sound.playDeal();

    let activeDeck = [...deck];
    const newCard = activeDeck.pop()!;
    updateCardCount([newCard]);

    if (activeHandIdx === 0) {
      const nextHand = [...playerHand, newCard];
      setPlayerHand(nextHand);
      setDeck(activeDeck);
      setMainHandStatus('doubled');

      const score = calculateHandScore(nextHand);
      if (score > 21) {
        setMainHandStatus('busted');
        sound.playError();
        if (splitHand) {
          setActiveHandIdx(1);
        } else {
          setGameInProgress(false);
        }
      } else {
        if (splitHand) {
          setActiveHandIdx(1);
        } else {
          setDealerTurn(true);
          revealHoleCardAndExecuteDealer(dealerHand[1], nextHand, 'doubled');
        }
      }
    }
  };

  // Split command
  const split = () => {
    if (!gameInProgress) return;
    if (onActionRound && serverRoundId) {
      void (async () => {
        try {
          sound.playDeal();
          const view = await onActionRound(serverRoundId, 'split');
          applyServerView(view);
          onTriggerNotification("Split hand locked. Play main hand first, then second hand.", "success");
        } catch (error) {
          sound.playError();
          onTriggerNotification(error instanceof Error ? error.message : "Blackjack split failed.", "error");
        }
      })();
      return;
    }
    if (playerHand.length !== 2) return;
    const canSplit = canSplitBlackjackHand(toBlackjackCards(playerHand));

    if (!canSplit) {
      sound.playError();
      onTriggerNotification("Card indices properties must match to split!", "error");
      return;
    }

    if (user.walletBalance < bet) {
      sound.playError();
      onTriggerNotification("Insufficient virtual currency to place a split bet!", "error");
      return;
    }

    onUpdateWallet(-bet);
    sound.playDeal();

    // Separate main hand cards into playerHand [card1, newP] and splitHand [card2, newS]
    let activeDeck = [...deck];
    const card1 = playerHand[0];
    const card2 = playerHand[1];

    const newPCard = activeDeck.pop()!;
    const newSCard = activeDeck.pop()!;

    updateCardCount([newPCard, newSCard]);

    setPlayerHand([card1, newPCard]);
    setSplitHand([card2, newSCard]);
    setDeck(activeDeck);

    onTriggerNotification("Splitted hand successfully! Play both routes independently.", "success");
  };

  const revealHoleCardAndExecuteDealer = (holeCard: Card, plHand: Card[], plStatus: string) => {
    // Hole card revealed to player: update card counts
    updateCardCount([holeCard]);

    let activeDeck = [...deck];
    let activeDealerHand = [...dealerHand];
    // Dealer draws on soft 17
    const intervalDraw = setInterval(() => {
      if (shouldDealerDraw(toBlackjackCards(activeDealerHand))) {
        sound.playDeal();
        const nextC = activeDeck.pop()!;
        activeDealerHand.push(nextC);
        updateCardCount([nextC]);
        setDealerHand([...activeDealerHand]);
        setDeck(activeDeck);
      } else {
        clearInterval(intervalDraw);
        evaluateStandardResults(activeDealerHand, plHand, plStatus);
      }
    }, 600);
  };

  const evaluateSplitDealerDraw = () => {
    setDealerTurn(true);
    const holeCard = dealerHand[1];
    updateCardCount([holeCard]);

    let activeDeck = [...deck];
    let activeDealerHand = [...dealerHand];
    const intervalDraw = setInterval(() => {
      if (shouldDealerDraw(toBlackjackCards(activeDealerHand))) {
        sound.playDeal();
        const nextC = activeDeck.pop()!;
        activeDealerHand.push(nextC);
        updateCardCount([nextC]);
        setDealerHand([...activeDealerHand]);
        setDeck(activeDeck);
      } else {
        clearInterval(intervalDraw);
        evaluateSplitResults(activeDealerHand);
      }
    }, 600);
  };

  // Evaluate standard 1 Hand win logic
  const evaluateStandardResults = (finalDealerHand: Card[], plHand: Card[], plStatus: string) => {
    setGameInProgress(false);

    const matchBet = plStatus === 'doubled' ? bet * 2 : bet;
    const result = settleBlackjackHand(
      toBlackjackCards(plHand),
      toBlackjackCards(finalDealerHand),
      asMoney(bet),
      { doubled: plStatus === 'doubled' }
    );

    if (result.status === 'lose') {
      setMainHandStatus('lose');
      sound.playError();
      onTriggerNotification(`Dealer wins with ${result.dealerScore}. -$${matchBet}`, 'error');
    } else if (result.status === 'win') {
      setMainHandStatus('win');
      sound.playWin();
      onUpdateWallet(result.payout);
      onTriggerNotification(`You won against Dealer! Returned $${result.payout}.`, 'success');
    } else if (result.status === 'blackjack') {
      setMainHandStatus('blackjack');
      sound.playBigWin();
      onUpdateWallet(result.payout);
      onTriggerNotification(`BLACKJACK! Returned $${result.payout}.`, 'success');
    } else {
      setMainHandStatus('push');
      onUpdateWallet(result.payout);
      onTriggerNotification(`Push round! Bet refunded.`, 'info');
    }
  };

  // Evaluate 2 Split Hands
  const evaluateSplitResults = (finalDealerHand: Card[]) => {
    setGameInProgress(false);

    // Evaluate Hand 1
    let payBack = 0;
    const mainResult = settleBlackjackHand(
      toBlackjackCards(playerHand),
      toBlackjackCards(finalDealerHand),
      asMoney(bet),
      { naturalBlackjackAllowed: false }
    );
    if (mainHandStatus === 'busted' || mainResult.status === 'lose') {
      setMainHandStatus('lose');
    } else if (mainResult.status === 'win' || mainResult.status === 'blackjack') {
      setMainHandStatus('win');
      payBack += mainResult.payout;
    } else {
      setMainHandStatus('push');
      payBack += mainResult.payout;
    }

    // Evaluate Hand 2
    if (splitHand) {
      const splitResult = settleBlackjackHand(
        toBlackjackCards(splitHand),
        toBlackjackCards(finalDealerHand),
        asMoney(bet),
        { naturalBlackjackAllowed: false }
      );
      if (splitHandStatus === 'busted' || splitResult.status === 'lose') {
        setSplitHandStatus('lose');
      } else if (splitResult.status === 'win' || splitResult.status === 'blackjack') {
        setSplitHandStatus('win');
        payBack += splitResult.payout;
      } else {
        setSplitHandStatus('push');
        payBack += splitResult.payout;
      }
    }

    onUpdateWallet(payBack);
    if (payBack > bet * 2) {
      sound.playBigWin();
      onTriggerNotification(`Split complete: Both hands win +$${payBack}!`, 'success');
    } else if (payBack > 0) {
      sound.playWin();
      onTriggerNotification(`Split complete: Resolved. Returned $${payBack}`, 'success');
    } else {
      sound.playError();
      onTriggerNotification("Dealer wins both hands! -$ " + (bet * 2), 'error');
    }
  };

  const getSuitSymbol = (suit: Card['suit']) => {
    switch (suit) {
      case 'hearts': return { s: '♥', c: 'text-red-500' };
      case 'diamonds': return { s: '♦', c: 'text-red-500' };
      case 'clubs': return { s: '♣', c: 'text-neutral-300' };
      case 'spades': return { s: '♠', c: 'text-neutral-300' };
    }
  };

  // True Count computation = Running Count / Decks remaining (apprx 6 total decks)
  const estimatedDecksLeft = Math.max(1, Math.round((312 - cardsPlayedCount) / 52));
  const trueCount = parseFloat((runningCount / estimatedDecksLeft).toFixed(1));

  return (
    <div id="blackjack_wrapper" className="space-y-6">
      {/* Blackjack Room layout */}
      <div className="relative bg-[#022c22] rounded-3xl border border-emerald-500/30 p-6 md:p-8 overflow-hidden shadow-2xl">
        {/* Neon green table ring felt decorations */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.06)_0%,transparent_75%)] pointer-events-none" />

        {/* Felt text brandings */}
        <div className="absolute inset-x-0 top-1/4 text-center select-none pointer-events-none">
          <span className="text-emerald-800/40 font-black tracking-[0.25em] text-sm md:text-md uppercase block mb-1">
            Vegas Neon Blackjack Room
          </span>
          <span className="text-emerald-800/25 font-bold text-[10px] tracking-wider uppercase">
            Dealer must stand on soft 17 • Blackjack pays 3 to 2 • Splits supported
          </span>
        </div>

        {/* DEALER TABLE BAR */}
        <div className="relative mb-12 text-center z-10">
          <div className="inline-block bg-neutral-950/80 border border-emerald-500/20 text-xs px-3 py-1 rounded-full text-neutral-300 mb-3">
            Dealer Hand
            {dealerHand.length > 0 && (
              <span className="ml-1 text-emerald-400 font-bold">
                ({dealerTurn ? calculateHandScore(dealerHand) : 'Show ' + dealerHand[0].score})
              </span>
            )}
          </div>

          <div className="flex justify-center gap-2.5 min-h-[110px]">
            {dealerHand.map((card, idx) => {
              const sym = getSuitSymbol(card.suit);
              // Hide second card if it is not Dealer's Turn
              const isHoleCard = idx === 1 && !dealerTurn && !dealerTurn;
              return (
                <div
                  key={idx}
                  className={`w-18 h-26 rounded-lg border flex flex-col justify-between p-2 shadow-md relative ${
                    isHoleCard
                      ? 'bg-gradient-to-br from-emerald-600 to-green-950 border-emerald-400'
                      : 'bg-white border-neutral-300'
                  }`}
                >
                  {isHoleCard ? (
                    <div className="absolute inset-0 flex items-center justify-center font-bold text-emerald-300 text-lg">
                      ?
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-black text-black leading-none">{card.value}</div>
                      <div className={`text-2xl self-center leading-none ${sym.c}`}>{sym.s}</div>
                      <div className="text-sm font-black text-black leading-none self-end scale-y-[-1] scale-x-[-1]">
                        {card.value}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {dealerHand.length === 0 && (
              <div className="w-18 h-26 border-2 border-dashed border-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-700 font-mono text-xs">
                Empty table
              </div>
            )}
          </div>
        </div>

        {/* PLAYER HAND SECTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative z-10">
          {/* Main Hand */}
          <div className={`text-center p-3 rounded-2xl border transition-all ${
            activeHandIdx === 0 && splitHand ? 'border-emerald-500 bg-emerald-950/20' : 'border-transparent'
          }`}>
            <div className="inline-block bg-neutral-950/80 border border-neutral-805 px-3 py-1 rounded-full text-xs text-neutral-300 mb-2">
              Main Hand
              {playerHand.length > 0 && (
                <span className="ml-1 text-yellow-400 font-bold">
                  ({calculateHandScore(playerHand)})
                </span>
              )}
            </div>

            <div className="flex justify-center gap-2 min-h-[110px]">
              {playerHand.map((card, idx) => {
                const sym = getSuitSymbol(card.suit);
                return (
                  <div
                    key={idx}
                    className="w-18 h-26 bg-white border border-neutral-300 rounded-lg flex flex-col justify-between p-2 shadow-md"
                  >
                    <div className="text-sm font-black text-black leading-none">{card.value}</div>
                    <div className={`text-2xl self-center leading-none ${sym.c}`}>{sym.s}</div>
                    <div className="text-sm font-black text-black leading-none self-end scale-y-[-1] scale-x-[-1]">
                      {card.value}
                    </div>
                  </div>
                );
              })}
              {playerHand.length === 0 && (
                <div className="w-18 h-26 border-2 border-dashed border-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-700 font-mono text-xs">
                  Place Bet
                </div>
              )}
            </div>
            {/* Main status alert */}
            {mainHandStatus !== 'playing' && mainHandStatus !== 'doubled' && playerHand.length > 0 && (
              <div className="mt-2 text-xs uppercase font-extrabold text-yellow-400 font-mono">
                {mainHandStatus}
              </div>
            )}
          </div>

          {/* Optional Split Hand */}
          {splitHand && (
            <div className={`text-center p-3 rounded-2xl border transition-all ${
              activeHandIdx === 1 ? 'border-emerald-400 bg-emerald-950/30' : 'border-transparent'
            }`}>
              <div className="inline-block bg-neutral-950/80 border border-neutral-805 px-3 py-1 rounded-full text-xs text-neutral-300 mb-2">
                Second Splitted Hand
                {splitHand.length > 0 && (
                  <span className="ml-1 text-cyan-400 font-bold">
                    ({calculateHandScore(splitHand)})
                  </span>
                )}
              </div>

              <div className="flex justify-center gap-2 min-h-[110px]">
                {splitHand.map((card, idx) => {
                  const sym = getSuitSymbol(card.suit);
                  return (
                    <div
                      key={idx}
                      className="w-18 h-26 bg-white border border-neutral-300 rounded-lg flex flex-col justify-between p-2 shadow-md"
                    >
                      <div className="text-sm font-black text-black leading-none">{card.value}</div>
                      <div className={`text-2xl self-center leading-none ${sym.c}`}>{sym.s}</div>
                      <div className="text-sm font-black text-black leading-none self-end scale-y-[-1] scale-x-[-1]">
                        {card.value}
                      </div>
                    </div>
                  );
                })}
              </div>
              {splitHandStatus !== 'playing' && splitHandStatus !== 'doubled' && (
                <div className="mt-2 text-xs uppercase font-extrabold text-cyan-400 font-mono">
                  {splitHandStatus}
                </div>
              )}
            </div>
          )}
        </div>

        {/* CONTROLS BAR */}
        <div className="relative bg-neutral-950/90 border border-emerald-500/20 p-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between z-10">
          {!gameInProgress ? (
            <div className="flex flex-col sm:flex-row gap-4 items-center w-full justify-between">
              {/* Ready Bet Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400 uppercase font-black tracking-wider">Bet Amount:</span>
                <button
                  onClick={() => handleBetChange(bet - 10)}
                  className="bg-neutral-850 hover:bg-neutral-800 font-bold text-white py-1 px-2.5 rounded font-mono text-xs cursor-pointer"
                >
                  -10
                </button>
                <div className="bg-neutral-900 border border-emerald-500/20 text-yellow-500 py-1.5 px-4 rounded text-sm font-bold min-w-16 text-center">
                  ${bet}
                </div>
                <button
                  onClick={() => handleBetChange(bet + 10)}
                  className="bg-neutral-850 hover:bg-neutral-800 font-bold text-white py-1 px-2.5 rounded font-mono text-xs cursor-pointer"
                >
                  +10
                </button>
                <button
                  onClick={() => handleBetChange(150)}
                  className="bg-neutral-850 hover:bg-neutral-800 text-emerald-400 py-1 px-2 rounded font-mono text-xs cursor-pointer"
                >
                  $150
                </button>
              </div>

              {/* Deal Button */}
              <button
                onClick={dealNewGame}
                className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-neutral-950 hover:scale-[1.03] active:scale-[0.98] transition-all font-black uppercase text-xs tracking-widest py-3 px-8 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="h-4 w-4" />
                Place Bet & Deal
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5 w-full justify-center">
              <button
                onClick={hit}
                className="bg-neutral-900 text-white hover:bg-neutral-800 py-2.5 px-6 rounded-lg font-bold text-xs uppercase cursor-pointer"
              >
                Hit +
              </button>
              <button
                onClick={stand}
                className="bg-emerald-900 hover:bg-emerald-800 text-white py-2.5 px-6 rounded-lg font-bold text-xs uppercase cursor-pointer"
              >
                Stand ✋
              </button>

              {/* Only Allow Double initially */}
              {playerHand.length === 2 && (
                <button
                  onClick={doubleDown}
                  className="bg-yellow-600 text-white hover:bg-yellow-500 py-2.5 px-5 rounded-lg font-bold text-xs uppercase cursor-pointer"
                >
                  Double Down x2
                </button>
              )}

              {/* Only allow Split if valid */}
              {playerHand.length === 2 && canSplitBlackjackHand(toBlackjackCards(playerHand)) && !splitHand && (
                <button
                  onClick={split}
                  className="bg-purple-800 text-white hover:bg-purple-700 py-2.5 px-5 rounded-lg font-bold text-xs uppercase cursor-pointer"
                >
                  Split Hand ⇄
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hi-Lo Educational Card Counting block */}
      <div id="card_counter_hud" className="bg-neutral-900/30 border border-neutral-850/60 p-4 rounded-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" />
              RNG Analyzer: Live Hi-Lo Card Counting HUD
            </h4>
            <p className="text-[11px] text-neutral-400">
              The Hi-Lo system tracks remaining high and low value cards. It serves as an analytical reference.
            </p>
          </div>

          <div className="flex gap-4">
            <div className="bg-neutral-950 p-2 rounded border border-neutral-800 text-center min-w-[70px]">
              <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Running Count</div>
              <div className={`text-md font-extrabold ${runningCount > 0 ? 'text-emerald-400' : runningCount < 0 ? 'text-red-500' : 'text-white'}`}>
                {runningCount > 0 ? `+${runningCount}` : runningCount}
              </div>
            </div>

            <div className="bg-neutral-950 p-2 rounded border border-neutral-800 text-center min-w-[70px]">
              <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">True Count</div>
              <div className={`text-md font-extrabold ${trueCount > 0 ? 'text-emerald-400' : trueCount < 0 ? 'text-red-500' : 'text-white'}`}>
                {trueCount > 0 ? `+${trueCount}` : trueCount}
              </div>
            </div>

            <button
              onClick={() => {
                sound.playClick();
                initDeck();
                onTriggerNotification("Card counting shoe successfully reshuffled!", "info");
              }}
              className="bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-white px-2.5 rounded text-xs leading-none flex items-center justify-center gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Shoe
            </button>
          </div>
        </div>

        {/* Card guide references */}
        <div className="mt-3 border-t border-neutral-850/40 pt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-neutral-400 leading-snug">
          <div>
            🟢 <strong className="text-neutral-300">2, 3, 4, 5, 6 adds +1</strong> to score. Contains low value cards remaining.
          </div>
          <div>
            🟡 <strong className="text-neutral-300">7, 8, 9 scores 0</strong> value. Neutral cards.
          </div>
          <div>
            🔴 <strong className="text-neutral-300">10, J, Q, K, A subtracts -1</strong> from count. High value cards.
          </div>
          <div className="bg-neutral-950/40 p-1.5 rounded border border-neutral-850/30">
            {trueCount > 1.5 ? (
              <span className="text-emerald-400 font-bold">🔥 Advantage High: Better for Player! Bet larger.</span>
            ) : trueCount < -1.5 ? (
              <span className="text-red-400 font-bold">❄️ Advantage Low: Safe bets recommended.</span>
            ) : (
              <span>⚖️ Fair Count: Balanced shoe statistics.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

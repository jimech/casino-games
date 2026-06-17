import React, { useState } from 'react';
import { Play, Award, Star, History, Info } from 'lucide-react';
import { sound } from '../utils/audio';
import { UserProfile } from '../types';
import {
  EUROPEAN_ROULETTE_SEQUENCE,
  RED_NUMBERS as ROULETTE_RED_NUMBERS,
  RouletteBetSlip,
  getRouletteColor,
  resolveRoulettePayout,
  totalRouletteStake
} from '../domain/roulette';
import { asMoney } from '../domain/money';

interface RouletteGameProps {
  user: UserProfile;
  onUpdateWallet: (amount: number) => void;
  onResolveSpin?: (bets: RouletteBetSlip) => Promise<{
    outcome: { number: number; color: 'red' | 'black' | 'green' };
    stake: number;
    payout: number;
  }>;
  onTriggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

const ROULETTE_NUMBERS = EUROPEAN_ROULETTE_SEQUENCE.map(num => ({
  num,
  color: getRouletteColor(num)
}));

type RouletteUiBets = {
  red: number;
  black: number;
  even: number;
  odd: number;
  numbers: { [num: number]: number };
};

const createEmptyBets = (): RouletteUiBets => ({
  red: 0,
  black: 0,
  even: 0,
  odd: 0,
  numbers: {}
});

const toBetSlip = (bets: RouletteUiBets): RouletteBetSlip => ({
  outside: {
    ...(bets.red > 0 ? { red: asMoney(bets.red) } : {}),
    ...(bets.black > 0 ? { black: asMoney(bets.black) } : {}),
    ...(bets.even > 0 ? { even: asMoney(bets.even) } : {}),
    ...(bets.odd > 0 ? { odd: asMoney(bets.odd) } : {})
  },
  straight: Object.fromEntries(
    Object.entries(bets.numbers)
      .filter(([, amount]) => amount > 0)
      .map(([num, amount]) => [Number(num), asMoney(amount)])
  )
});

export default function RouletteGame({ user, onUpdateWallet, onResolveSpin, onTriggerNotification }: RouletteGameProps) {
  const [selectedChip, setSelectedChip] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [wheelDegree, setWheelDegree] = useState(0);
  const [outcomeNumber, setOutcomeNumber] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([32, 15, 0, 19]);

  // Current Bets Placed
  const [bets, setBets] = useState<RouletteUiBets>(createEmptyBets);

  const totalBetAmount = totalRouletteStake(toBetSlip(bets));

  const clearBets = () => {
    sound.playClick();
    setBets(createEmptyBets());
  };

  const placeBetOnField = (field: 'red' | 'black' | 'even' | 'odd') => {
    sound.playClick();
    if (user.walletBalance < totalBetAmount + selectedChip) {
      sound.playError();
      onTriggerNotification("Insufficient coins to place this roulette bet!", "error");
      return;
    }
    setBets(prev => ({
      ...prev,
      [field]: prev[field] + selectedChip
    }));
  };

  const placeBetOnNumber = (num: number) => {
    sound.playClick();
    if (user.walletBalance < totalBetAmount + selectedChip) {
      sound.playError();
      onTriggerNotification("Insufficient coins to place this roulette bet!", "error");
      return;
    }
    setBets(prev => {
      const updatedNumbers = { ...prev.numbers };
      updatedNumbers[num] = (updatedNumbers[num] || 0) + selectedChip;
      return {
        ...prev,
        numbers: updatedNumbers
      };
    });
  };

  const handleSpinWheel = async () => {
    if (spinning) return;
    if (totalBetAmount === 0) {
      sound.playError();
      onTriggerNotification("Please place a bet before spinning the wheel!", "error");
      return;
    }

    const roundBetSlip = toBetSlip(bets);
    const roundStake = totalRouletteStake(roundBetSlip);

    let selectedItem: { num: number; color: 'red' | 'black' | 'green' };
    let payout = 0;

    try {
      if (onResolveSpin) {
        const result = await onResolveSpin(roundBetSlip);
        selectedItem = { num: result.outcome.number, color: result.outcome.color };
        payout = result.payout;
      } else {
        onUpdateWallet(-totalBetAmount);
        const rngIndex = Math.floor(Math.random() * ROULETTE_NUMBERS.length);
        selectedItem = ROULETTE_NUMBERS[rngIndex];
        payout = resolveRoulettePayout(roundBetSlip, {
          number: selectedItem.num,
          color: getRouletteColor(selectedItem.num)
        });
        if (payout > 0) onUpdateWallet(payout);
      }
    } catch (error) {
      sound.playError();
      onTriggerNotification(error instanceof Error ? error.message : "Roulette spin failed.", "error");
      return;
    }

    setSpinning(true);
    setOutcomeNumber(null);

    const rngIndex = ROULETTE_NUMBERS.findIndex(item => item.num === selectedItem.num);

    // Compute rotational spin distance (multiple full rotations + offset for the selected index symbol)
    const sectorsCount = ROULETTE_NUMBERS.length;
    const sectorAngle = 360 / sectorsCount;
    const targetSectorAngle = rngIndex * sectorAngle;

    // Fast dynamic ticks effect sound playing
    let tickCount = 0;
    const ticker = setInterval(() => {
      sound.playSpin();
      tickCount++;
      if (tickCount >= 12) clearInterval(ticker);
    }, 150);

    const spinTotalDegree = wheelDegree + (360 * 5) - targetSectorAngle;
    setWheelDegree(spinTotalDegree);

    setTimeout(() => {
      clearInterval(ticker);
      sound.playWin();

      setSpinning(false);
      setOutcomeNumber(selectedItem.num);
      setHistory(prev => [selectedItem.num, ...prev.slice(0, 9)]);

      // Evaluate bets payouts
      evaluateRoulettePayouts(selectedItem.num, roundStake, payout);
    }, 2500);
  };

  const evaluateRoulettePayouts = (resultNum: number, roundStake: number, payout: number) => {
    if (payout > 0) {
      sound.playBigWin();
      onTriggerNotification(`🎰 Wheel hit ${resultNum}! Returned $${payout} from a $${roundStake} stake.`, "success");
    } else {
      sound.playError();
      onTriggerNotification(`Wheel hit ${resultNum}. Better luck next round!`, "info");
    }

    // Auto clear bets for easy next spin
    setBets(createEmptyBets());
  };

  return (
    <div id="roulette_game_block" className="space-y-6">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Award className="h-44 w-44 text-yellow-500" />
        </div>

        {/* Real-time stats header */}
        <div className="flex flex-wrap justify-between items-center gap-4 border-b border-neutral-800/80 pb-4 mb-6">
          <div>
            <h3 className="text-lg font-black uppercase text-neutral-100 flex items-center gap-1.5">
              <Star className="h-5 w-5 text-yellow-400 animate-spin" />
              European Neon Roulette
            </h3>
            <p className="text-xs text-neutral-400">RNG Certificated Single Zero Table. Win payline 35:1 on numbers.</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400 font-bold uppercase flex items-center gap-1">
              <History className="h-3.5 w-3.5" /> Recent Spins:
            </span>
            <div className="flex gap-1.5">
              {history.map((h, i) => (
                <span
                  key={i}
                  className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-xs ${
                    h === 0
                      ? 'bg-emerald-600 text-neutral-950'
                      : ROULETTE_RED_NUMBERS.has(h)
                      ? 'bg-red-600 text-white'
                      : 'bg-neutral-800 text-white'
                  }`}
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* ROULETTE WHEEL GRAPHIC */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-64 h-64 md:w-72 md:h-72 rounded-full border-8 border-neutral-900 shadow-2xl flex items-center justify-center bg-zinc-950">
              {/* Outer wheel rotation cover */}
              <div
                style={{
                  transform: `rotate(${wheelDegree}deg)`,
                  transition: spinning ? 'transform 2.5s cubic-bezier(0.1, 0.8, 0.25, 1)' : 'none'
                }}
                className="absolute inset-2 rounded-full border border-neutral-800 bg-[conic-gradient(from_0deg,#ef4444_0deg_18deg,#27272a_18deg_36deg,#ef4444_36deg_54deg,#27272a_54deg_72deg,#ef4444_72deg_90deg,#27272a_90deg_108deg,#ef4444_108deg_126deg,#27272a_126deg_144deg,#ef4444_144deg_162deg,#27272a_162deg_180deg,#ef4444_180deg_198deg,#27272a_198deg_216deg,#ef4444_216deg_234deg,#27272a_234deg_252deg,#ef4444_252deg_270deg,#27272a_270deg_288deg,#ef4444_288deg_306deg,#27272a_306deg_324deg,#ef4444_324deg_342deg,#22c55e_342deg_360deg)] shadow-inner"
              >
                {/* Sector text labels */}
                {ROULETTE_NUMBERS.map((n, idx) => {
                  const angle = idx * (360 / ROULETTE_NUMBERS.length);
                  return (
                    <div
                      key={idx}
                      style={{
                        transform: `rotate(${angle}deg)`,
                        transformOrigin: '50% 100%',
                        height: '50%',
                        top: 0
                      }}
                      className="absolute inset-x-0 mx-auto w-2 text-center text-[7px] font-bold text-white tracking-widest leading-none pt-1"
                    >
                      {n.num}
                    </div>
                  );
                })}
              </div>

              {/* Central neon pointer needle */}
              <div className="absolute top-1.5 inset-x-0 mx-auto w-4 h-6 border-b-8 border-b-yellow-400 border-x-transparent border-x-4 z-40" />

              {/* Centre hub spinner */}
              <div className="absolute w-20 h-20 bg-neutral-900 border-4 border-zinc-800 rounded-full flex flex-col items-center justify-center shadow-lg z-30">
                {outcomeNumber !== null ? (
                  <div className="text-center animate-scaleUp">
                    <span className="block text-[8px] uppercase font-bold tracking-wider text-neutral-400">HIT</span>
                    <span className={`block text-xl font-black ${
                      outcomeNumber === 0
                        ? 'text-emerald-400'
                        : ROULETTE_RED_NUMBERS.has(outcomeNumber)
                        ? 'text-red-400'
                        : 'text-neutral-200'
                    }`}>
                      {outcomeNumber}
                    </span>
                  </div>
                ) : (
                  <span className="text-[9px] uppercase font-black tracking-widest text-yellow-400 animate-pulse text-center">
                    {spinning ? 'SPINNING' : 'READY'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* EUROPEAN BETTING FELT */}
          <div className="lg:col-span-7 space-y-4">
            {/* Main Number Grid (0 on left, 3x12 columns) */}
            <div className="flex bg-neutral-950/40 p-1 border border-neutral-800 rounded-xl overflow-x-auto">
              {/* Zero container */}
              <button
                disabled={spinning}
                onClick={() => placeBetOnNumber(0)}
                className="w-12 hover:bg-emerald-500/30 transition-all border border-neutral-800 rounded-l-lg flex flex-col items-center justify-center p-3 text-emerald-400 font-black text-sm cursor-pointer"
              >
                0
                {bets.numbers[0] > 0 && (
                  <span className="bg-emerald-500 text-neutral-950 font-bold font-mono text-[9px] px-1 rounded-full mt-1.5">
                    ${bets.numbers[0]}
                  </span>
                )}
              </button>

              {/* 36 Numbers Grid */}
              <div className="grid grid-cols-12 grid-rows-3 gap-1 flex-1 p-1">
                {Array.from({ length: 36 }, (_, idx) => {
                  const num = idx + 1;
                  const isRed = ROULETTE_RED_NUMBERS.has(num);
                  return (
                    <button
                      key={num}
                      disabled={spinning}
                      onClick={() => placeBetOnNumber(num)}
                      className={`h-11 min-w-[32px] rounded border border-neutral-800 hover:scale-[1.08] transition-all flex flex-col items-center justify-center text-xs font-bold leading-none cursor-pointer ${
                        isRed ? 'bg-red-950/80 hover:bg-red-900/90 text-red-100' : 'bg-neutral-900/80 hover:bg-neutral-800 text-neutral-200'
                      }`}
                    >
                      {num}
                      {bets.numbers[num] > 0 && (
                        <span className="bg-yellow-400 text-neutral-950 font-mono text-[8px] font-black px-0.5 rounded mt-1">
                          ${bets.numbers[num]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Outside Bet Builders */}
            <div className="grid grid-cols-4 gap-2">
              <button
                disabled={spinning}
                onClick={() => placeBetOnField('red')}
                className="bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 rounded-xl py-4 flex flex-col items-center justify-center text-red-400 font-black text-xs uppercase tracking-wide cursor-pointer"
              >
                🔴 RED (1:1)
                {bets.red > 0 && (
                  <span className="bg-red-500 text-neutral-950 font-mono text-[9px] px-1.5 py-0.5 rounded-full mt-1">
                    ${bets.red}
                  </span>
                )}
              </button>

              <button
                disabled={spinning}
                onClick={() => placeBetOnField('black')}
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/60 rounded-xl py-4 flex flex-col items-center justify-center text-neutral-200 font-black text-xs uppercase tracking-wide cursor-pointer"
              >
                ⚫ BLACK (1:1)
                {bets.black > 0 && (
                  <span className="bg-neutral-200 text-neutral-955 font-mono text-[9px] px-1.5 py-0.5 rounded-full mt-1">
                    ${bets.black}
                  </span>
                )}
              </button>

              <button
                disabled={spinning}
                onClick={() => placeBetOnField('even')}
                className="bg-indigo-950/20 hover:bg-indigo-950/40 border border-indigo-500/30 rounded-xl py-4 flex flex-col items-center justify-center text-indigo-400 font-bold text-xs uppercase tracking-wide cursor-pointer"
              >
                EVEN (1:1)
                {bets.even > 0 && (
                  <span className="bg-indigo-500 text-neutral-950 font-mono text-[9px] px-1.5 py-0.5 rounded-full mt-1">
                    ${bets.even}
                  </span>
                )}
              </button>

              <button
                disabled={spinning}
                onClick={() => placeBetOnField('odd')}
                className="bg-yellow-950/20 hover:bg-yellow-950/40 border border-yellow-500/30 rounded-xl py-4 flex flex-col items-center justify-center text-yellow-400 font-bold text-xs uppercase tracking-wide cursor-pointer"
              >
                ODD (1:1)
                {bets.odd > 0 && (
                  <span className="bg-yellow-400 text-neutral-950 font-mono text-[9px] px-1.5 py-0.5 rounded-full mt-1">
                    ${bets.odd}
                  </span>
                )}
              </button>
            </div>

            {/* Chip Picker Panel */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-neutral-850/40 pt-4">
              <div className="flex gap-2.5 items-center">
                <span className="text-xs text-neutral-400 font-black uppercase tracking-wider">Select Chip:</span>
                {[5, 10, 25, 100, 500].map(val => (
                  <button
                    key={val}
                    disabled={spinning}
                    onClick={() => {
                      sound.playClick();
                      setSelectedChip(val);
                    }}
                    className={`h-10 w-10 md:h-11 md:w-11 rounded-full border-2 font-black text-xs flex items-center justify-center transition-all cursor-pointer ${
                      selectedChip === val
                        ? 'bg-yellow-400 border-white text-neutral-950 scale-110 shadow-lg'
                        : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-white'
                    }`}
                  >
                    ${val}
                  </button>
                ))}
              </div>

              {/* Action Board */}
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  disabled={spinning || totalBetAmount === 0}
                  onClick={clearBets}
                  className="bg-neutral-900 text-neutral-400 hover:bg-neutral-850 hover:text-white px-4 py-3 text-xs uppercase font-extrabold rounded-xl transition-all cursor-pointer"
                >
                  Clear Bet
                </button>

                <button
                  onClick={handleSpinWheel}
                  disabled={spinning}
                  className="flex-1 sm:flex-initial bg-gradient-to-r from-red-500 via-pink-600 to-purple-600 hover:from-red-400 hover:to-purple-500 text-white font-black uppercase text-xs tracking-wider py-3.5 px-8 rounded-xl flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  <Play className="h-4 w-4" />
                  Spin Wheel ${totalBetAmount > 0 ? `(${totalBetAmount})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mini Rules Accordion Reference */}
      <div className="bg-neutral-900/30 border border-neutral-880 p-3.5 rounded-xl flex gap-3 text-xs text-neutral-400 leading-snug">
        <Info className="h-4 w-4 text-neutral-500 shrink-0" />
        <div>
          Any chips dropped on the board constitute your bets. Inside Single Number bets pay a maximum coefficient payout of <strong className="text-emerald-400">35 to 1</strong> if hit! Multiple outer color/parity stakes can be layered concurrently for structural low-risk strategy.
        </div>
      </div>
    </div>
  );
}

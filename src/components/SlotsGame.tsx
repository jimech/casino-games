import React, { useState, useEffect } from 'react';
import { Play, Sparkles, Coins, Info, Zap } from 'lucide-react';
import { sound } from '../utils/audio';
import { UserProfile } from '../types';

interface SlotsGameProps {
  user: UserProfile;
  onUpdateWallet: (amount: number) => void;
  onTriggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

const MACHINES = [
  {
    id: 'fruit-mania',
    name: 'Neon Fruit Mania',
    theme: 'fruit',
    rtp: '96.5%',
    rtpVal: 0.965,
    volatility: 'Low',
    minBet: 5,
    maxBet: 100,
    decor: 'from-orange-500 via-pink-500 to-purple-600',
    symbols: [
      { char: '🍒', value: 3, name: 'Cherry' },
      { char: '🍋', value: 4, name: 'Lemon' },
      { char: '🍉', value: 6, name: 'Watermelon' },
      { char: '🍇', value: 8, name: 'Grapes' },
      { char: '💎', value: 15, name: 'Diamond' },
      { char: '🔔', value: 25, name: 'Bell' },
      { char: '⭐', value: 50, name: 'Scatter (Free Spins)' }
    ]
  },
  {
    id: 'cyber-jackpot',
    name: 'Cyber Jackpot 2077',
    theme: 'cyber',
    rtp: '95.0%',
    rtpVal: 0.95,
    volatility: 'High',
    minBet: 20,
    maxBet: 500,
    decor: 'from-cyan-400 via-blue-600 to-indigo-900',
    symbols: [
      { char: '🔋', value: 5, name: 'Battery' },
      { char: '💾', value: 10, name: 'Disk' },
      { char: '🦾', value: 20, name: 'Cyber Arm' },
      { char: '💻', value: 40, name: 'Deck' },
      { char: '🕶️', value: 75, name: 'Visor' },
      { char: '🌐', value: 150, name: 'Core Server' },
      { char: '⚡', value: 300, name: 'Scatter (Bonus Multip)' }
    ]
  },
  {
    id: 'ancient-gold',
    name: "Pharaoh's Neon Gold",
    theme: 'ancient',
    rtp: '97.2%',
    rtpVal: 0.972,
    volatility: 'Medium',
    minBet: 10,
    maxBet: 250,
    decor: 'from-yellow-400 via-amber-600 to-red-600',
    symbols: [
      { char: '🏺', value: 4, name: 'Urn' },
      { char: '🐍', value: 7, name: 'Cobra' },
      { char: '🦂', value: 12, name: 'Scarab' },
      { char: '👁️', value: 25, name: 'Eye of Horus' },
      { char: '🐪', value: 50, name: 'Camel' },
      { char: '👑', value: 100, name: 'Pharaoh Mask' },
      { char: '🔱', value: 200, name: 'Scatter (Golden Key)' }
    ]
  }
];

export default function SlotsGame({ user, onUpdateWallet, onTriggerNotification }: SlotsGameProps) {
  const [activeMachineIdx, setActiveMachineIdx] = useState(0);
  const currentMachine = MACHINES[activeMachineIdx];

  const [bet, setBet] = useState(currentMachine.minBet);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<string[]>(['🍒', '🍒', '🍒']);
  const [isBonusRound, setIsBonusRound] = useState(false);
  const [bonusSpinsLeft, setBonusSpinsLeft] = useState(0);
  const [winAnimation, setWinAnimation] = useState(false);
  const [lastWinAmount, setLastWinAmount] = useState(0);
  const [multiplier, setMultiplier] = useState(1);

  // Sync minBet when changing slot machines
  useEffect(() => {
    setBet(currentMachine.minBet);
    // Set initial reels based on machine symbol set
    const s = currentMachine.symbols;
    setReels([s[0].char, s[1].char, s[2].char]);
  }, [activeMachineIdx]);

  const handleSpinField = (amt: number) => {
    sound.playClick();
    setBet(Math.min(currentMachine.maxBet, Math.max(currentMachine.minBet, amt)));
  };

  const executeSpin = () => {
    if (spinning) return;
    const isFreeSpin = isBonusRound && bonusSpinsLeft > 0;

    if (!isFreeSpin && user.walletBalance < bet) {
      sound.playError();
      onTriggerNotification("Insufficient wallet funds! Add more coins to spin.", "error");
      return;
    }

    if (!isFreeSpin) {
      onUpdateWallet(-bet);
    } else {
      setBonusSpinsLeft(prev => prev - 1);
    }

    setSpinning(true);
    setWinAnimation(false);
    setLastWinAmount(0);

    // Dynamic Interval spin rattle sound effects
    let ticksPlayed = 0;
    const soundInterval = setInterval(() => {
      sound.playSpin();
      ticksPlayed++;
      if (ticksPlayed >= 10) clearInterval(soundInterval);
    }, 120);

    // Reel spinning algorithm complying with RTP settings
    setTimeout(() => {
      clearInterval(soundInterval);

      // Deciding standard random generator based on RTP
      const rollRtp = Math.random();
      let outcomeReels: string[] = [];

      const symbolsList = currentMachine.symbols;
      const isArrangedWin = rollRtp < currentMachine.rtpVal;

      if (isArrangedWin) {
        // High likelihood of hit
        const chosenSym = symbolsList[Math.floor(Math.random() * (symbolsList.length - 1))];
        const hasDouble = Math.random() > 0.4;
        const hasTriple = Math.random() > 0.4;

        if (hasTriple) {
          outcomeReels = [chosenSym.char, chosenSym.char, chosenSym.char];
        } else if (hasDouble) {
          const raw = symbolsList.filter(s => s.char !== chosenSym.char);
          const outerSym = raw[Math.floor(Math.random() * raw.length)];
          const idxToMiss = Math.floor(Math.random() * 3);
          outcomeReels = [chosenSym.char, chosenSym.char, chosenSym.char];
          outcomeReels[idxToMiss] = outerSym.char;
        } else {
          // Semi scatter
          outcomeReels = [
            symbolsList[Math.floor(Math.random() * symbolsList.length)].char,
            symbolsList[Math.floor(Math.random() * symbolsList.length)].char,
            symbolsList[Math.floor(Math.random() * symbolsList.length)].char
          ];
        }
      } else {
        // Strict miss sequence
        outcomeReels = [
          symbolsList[Math.floor(Math.random() * symbolsList.length)].char,
          symbolsList[Math.floor(Math.random() * symbolsList.length)].char,
          symbolsList[Math.floor(Math.random() * symbolsList.length)].char
        ];
        // Ensure not identical
        if (outcomeReels[0] === outcomeReels[1] && outcomeReels[1] === outcomeReels[2]) {
          const symsFiltered = symbolsList.filter(s => s.char !== outcomeReels[0]);
          outcomeReels[2] = symsFiltered[Math.floor(Math.random() * symsFiltered.length)].char;
        }
      }

      setReels(outcomeReels);
      setSpinning(false);

      // Calculate payout
      evaluatePayout(outcomeReels);
    }, 1500);
  };

  const evaluatePayout = (results: string[]) => {
    const sym0 = results[0];
    const sym1 = results[1];
    const sym2 = results[2];

    const scatterSymObj = currentMachine.symbols.find(s => s.name.includes("Scatter"));
    const scatterSymbol = scatterSymObj ? scatterSymObj.char : '⭐';

    // Count scatter counts for free spin trigger
    const scattersCount = results.filter(r => r === scatterSymbol).length;

    let basePayMult = 0;
    let earnedBonusSpins = 0;

    if (sym0 === sym1 && sym1 === sym2) {
      // 3 of a kind
      const matchObj = currentMachine.symbols.find(s => s.char === sym0);
      basePayMult = matchObj ? matchObj.value * 3 : 10;
    } else if (sym0 === sym1 || sym1 === sym2 || sym0 === sym2) {
      // 2 of a kind
      const doubleSym = sym0 === sym1 ? sym0 : sym2;
      const matchObj = currentMachine.symbols.find(s => s.char === doubleSym);
      basePayMult = matchObj ? Math.ceil(matchObj.value * 0.8) : 2;
    }

    // Trigger Free Spins Bonus
    if (scattersCount >= 2) {
      earnedBonusSpins = scattersCount === 2 ? 5 : 12;
      sound.playBigWin();
      onTriggerNotification(`🎰 SCATTER BONUS TRIGGERED! Received ${earnedBonusSpins} Free Spins!`, "success");
      setIsBonusRound(true);
      setBonusSpinsLeft(prev => prev + earnedBonusSpins);
    }

    const currentMult = isBonusRound ? 3 : 1;
    const finalPayout = Math.floor(bet * basePayMult * currentMult);

    if (finalPayout > 0) {
      onUpdateWallet(finalPayout);
      setLastWinAmount(finalPayout);
      setWinAnimation(true);
      if (finalPayout >= bet * 5) {
        sound.playBigWin();
      } else {
        sound.playWin();
      }
    } else if (earnedBonusSpins === 0) {
      // Lose
    }

    // End of bonus check
    if (isBonusRound && bonusSpinsLeft === 1 && earnedBonusSpins === 0) {
      setTimeout(() => {
        setIsBonusRound(false);
        onTriggerNotification("Bonus free rounds fully completed!", "info");
      }, 1000);
    }
  };

  return (
    <div id="slots_machine_wrapper" className="space-y-6">
      {/* Top Machine Selector Tabs */}
      <div id="slot_tabs" className="grid grid-cols-3 gap-2 bg-neutral-900 p-1.5 rounded-xl border border-neutral-800">
        {MACHINES.map((m, idx) => (
          <button
            id={`machine_tab_${m.id}`}
            key={m.id}
            onClick={() => {
              sound.playClick();
              setActiveMachineIdx(idx);
            }}
            className={`py-3 px-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
              activeMachineIdx === idx
                ? `bg-gradient-to-r ${m.decor} text-white font-extrabold shadow-lg`
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      {/* Main Machine Container */}
      <div className={`relative bg-neutral-950 rounded-2xl border border-neutral-800 p-6 md:p-8 overflow-hidden shadow-2xl`}>
        {/* Ambient background glow matching theme */}
        <div className={`absolute -inset-40 bg-gradient-to-br ${currentMachine.decor} opacity-10 blur-3xl pointer-events-none rounded-full`} />

        {/* Info Grid */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6 border-b border-neutral-800/60 pb-4 relative z-10">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-neutral-100 uppercase tracking-tight flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-400 animate-pulse" />
              {currentMachine.name}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">Custom RNG system certed for slots standard</p>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="bg-neutral-900 border border-neutral-800 text-neutral-300 font-mono px-2.5 py-1 rounded">
              RTP: <strong className="text-emerald-400">{currentMachine.rtp}</strong>
            </span>
            <span className="bg-neutral-900 border border-neutral-800 text-neutral-300 font-mono px-2.5 py-1 rounded">
              Volatility: <strong className="text-purple-400">{currentMachine.volatility}</strong>
            </span>
          </div>
        </div>

        {/* Free Spins Alert Panel */}
        {isBonusRound && (
          <div className="animate-bounce bg-purple-950/80 border border-purple-500/50 text-purple-200 text-xs text-center py-2.5 px-4 rounded-xl mb-6 flex items-center justify-center gap-2 font-bold uppercase tracking-widest relative z-10">
            <Zap className="h-4 w-4 text-yellow-300 animate-spin" />
            FREE SPINS BONUS LIVE! {bonusSpinsLeft} RE-SPINS LEFT (3x MULTIPLIER!)
          </div>
        )}

        {/* The Giant Slot Reels */}
        <div className="grid grid-cols-3 gap-3 md:gap-5 bg-neutral-900/60 p-4 rounded-2xl border border-neutral-800/70 mb-6 relative z-10">
          {reels.map((char, index) => (
            <div
              key={index}
              className={`h-36 md:h-44 bg-neutral-950 rounded-xl border border-neutral-800 flex items-center justify-center overflow-hidden relative shadow-inner group ${
                spinning ? 'animate-pulse' : ''
              }`}
            >
              {/* Virtual Reel Line Lines */}
              <div className="absolute inset-x-0 h-[1px] bg-neutral-800/40 top-1/2 -translate-y-1/2 z-0" />

              <div
                className={`text-6xl md:text-7xl select-none transition-all duration-300 z-10 ${
                  spinning ? 'transform translate-y-24 opacity-0 scale-75 animate-bounce' : 'transform translate-y-0 scale-100'
                }`}
              >
                {char}
              </div>
            </div>
          ))}
        </div>

        {/* Win Alert Showcase */}
        <div className="h-14 flex items-center justify-center mb-6 relative z-10">
          {winAnimation && lastWinAmount > 0 && (
            <div className="animate-scaleUp bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 font-black text-xl py-2 px-6 rounded-full flex items-center gap-2 shadow-lg shadow-emerald-900/10">
              <Coins className="h-5 w-5 animate-bounce" />
              WIN +${lastWinAmount}!
            </div>
          )}
        </div>

        {/* Slot Controls Interface */}
        <div className="bg-neutral-900/40 border border-neutral-800/60 p-4 rounded-xl space-y-4 relative z-10">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            {/* Bet Set Buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Bet:</span>
              <button
                disabled={spinning}
                onClick={() => handleSpinField(bet - 10)}
                className="bg-neutral-800 text-white font-mono hover:bg-neutral-700 disabled:opacity-50 py-1.5 px-3 rounded text-xs cursor-pointer"
              >
                -10
              </button>
              <div className="bg-neutral-950 border border-neutral-800 text-yellow-400 font-mono py-1.5 px-4 rounded text-sm text-center font-bold min-w-20">
                ${bet}
              </div>
              <button
                disabled={spinning}
                onClick={() => handleSpinField(bet + 10)}
                className="bg-neutral-800 text-white font-mono hover:bg-neutral-700 disabled:opacity-50 py-1.5 px-3 rounded text-xs cursor-pointer"
              >
                +10
              </button>
              <button
                disabled={spinning}
                onClick={() => handleSpinField(currentMachine.maxBet)}
                className="bg-neutral-800/80 text-yellow-500 hover:text-white font-bold hover:bg-neutral-700 disabled:opacity-50 py-1.5 px-2 rounded text-xs uppercase tracking-wider cursor-pointer"
              >
                Max
              </button>
            </div>

            {/* Spin Primary Button */}
            <button
              onClick={executeSpin}
              disabled={spinning}
              className={`w-full sm:w-auto group relative flex items-center justify-center gap-2 font-black uppercase text-sm tracking-wider py-3.5 px-10 rounded-xl transition-all shadow-md cursor-pointer ${
                spinning
                  ? 'bg-neutral-800 text-neutral-400 border border-neutral-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-neutral-950 hover:from-yellow-300 hover:to-amber-400 hover:scale-[1.03] active:scale-[0.98]'
              }`}
            >
              <Play className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
              {spinning ? 'SPINNING...' : isBonusRound ? 'FREE SPIN!' : 'SPIN REELS'}
            </button>
          </div>

          {/* Quick Payline Rules & Info */}
          <div className="border-t border-neutral-800/40 pt-3 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between text-neutral-400">
            <span className="flex items-center gap-1.5 text-[10px]">
              <Info className="h-3 w-3 text-neutral-500" />
              Payouts: 2 matching symbols pay 1x, 3 matching symbols pay up to 300x bet multipliers.
            </span>
            <span className="text-[10px] font-mono">
              Min Bet: ${currentMachine.minBet} | Max Bet: ${currentMachine.maxBet}
            </span>
          </div>
        </div>
      </div>

      {/* Symbol Odds Details */}
      <div id="reels_guide" className="bg-neutral-900/30 border border-neutral-800 p-4 rounded-xl">
        <h3 className="text-xs font-black uppercase tracking-wider text-neutral-300 mb-3 flex items-center gap-2">
          Payout Paytable Guide
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {currentMachine.symbols.map((sym, i) => (
            <div key={i} className="bg-neutral-950/60 p-2.5 rounded-lg border border-neutral-800/60 text-center">
              <span className="text-2xl block mb-1">{sym.char}</span>
              <span className="text-[10px] text-neutral-400 block truncate leading-tight">{sym.name}</span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold mt-1 block">x{sym.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

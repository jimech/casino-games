import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, AlertTriangle, TrendingUp, Rocket, HeartCrack } from 'lucide-react';
import { sound } from '../utils/audio';
import { UserProfile } from '../types';
import { asMoney } from '../domain/money';
import { multiplierFromElapsedMs, resolveCrashCashout } from '../domain/crash';

interface CrashGameProps {
  user: UserProfile;
  onUpdateWallet: (amount: number) => void;
  onStartRound?: (stake: number) => Promise<{ roundId: string; crashPoint: number; walletAvailable: number }>;
  onCashoutRound?: (roundId: string, cashoutMultiplier: number) => Promise<{
    payout: number;
    cashoutMultiplier: number;
    walletAvailable: number;
  }>;
  onTriggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

export default function CrashGame({ user, onUpdateWallet, onStartRound, onCashoutRound, onTriggerNotification }: CrashGameProps) {
  const [bet, setBet] = useState(20);
  const [gameState, setGameState] = useState<'idle' | 'flying' | 'crashed'>('idle');
  const [multiplier, setMultiplier] = useState(1.0);
  const [history, setHistory] = useState<number[]>([1.45, 3.20, 1.12, 5.80, 1.02, 2.11]);
  const [winAmount, setWinAmount] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const crashPointRef = useRef<number>(2.0);
  const multiplierRef = useRef<number>(1.0);
  const roundStakeRef = useRef<number>(bet);
  const roundIdRef = useRef<string | null>(null);

  const handleStartFlight = async () => {
    if (gameState === 'flying') return;
    if (user.walletBalance < bet) {
      sound.playError();
      onTriggerNotification("Insufficient coins to start rocket launch!", "error");
      return;
    }

    try {
      if (onStartRound) {
        const launch = await onStartRound(bet);
        roundIdRef.current = launch.roundId;
        crashPointRef.current = launch.crashPoint;
      } else {
        onUpdateWallet(-bet);
        roundIdRef.current = null;
        crashPointRef.current = 2.0;
      }
      roundStakeRef.current = bet;
      sound.playClick();
      sound.playSpin();
    } catch (error) {
      sound.playError();
      onTriggerNotification(error instanceof Error ? error.message : "Crash launch failed.", "error");
      return;
    }

    setGameState('flying');
    setWinAmount(null);
    setMultiplier(1.0);
    multiplierRef.current = 1.0;

    const startTime = Date.now();

    const loop = () => {
      // Multiplier flies exponentially
      const currentMult = multiplierFromElapsedMs(Date.now() - startTime);
      setMultiplier(currentMult);
      multiplierRef.current = currentMult;

      // Draw active flight arc
      drawFlightPath(currentMult);

      if (currentMult >= crashPointRef.current) {
        // CRASHED!
        void settleCrashedRound(currentMult);
        sound.playError();
        setGameState('crashed');
        setHistory(prev => [crashPointRef.current, ...prev.slice(0, 9)]);
        onTriggerNotification(`💥 The rocket exploded at ${crashPointRef.current}x! Stake lost.`, "error");
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      } else {
        sound.playCrashTick();
        animationFrameId.current = requestAnimationFrame(loop);
      }
    };

    animationFrameId.current = requestAnimationFrame(loop);
  };

  const handleCashout = async () => {
    if (gameState !== 'flying') return;

    const earnedRatio = multiplierRef.current;
    let finalPayout: number = resolveCrashCashout(asMoney(roundStakeRef.current), earnedRatio, crashPointRef.current);
    let settledMultiplier = earnedRatio;

    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);

    try {
      if (onCashoutRound && roundIdRef.current) {
        const result = await onCashoutRound(roundIdRef.current, earnedRatio);
        finalPayout = result.payout;
        settledMultiplier = result.cashoutMultiplier;
      } else {
        onUpdateWallet(finalPayout);
      }
      roundIdRef.current = null;
    } catch (error) {
      sound.playError();
      onTriggerNotification(error instanceof Error ? error.message : "Crash cashout failed.", "error");
      return;
    }

    setGameState('idle');
    setWinAmount(finalPayout);
    setHistory(prev => [settledMultiplier, ...prev.slice(0, 9)]);
    sound.playBigWin();

    onTriggerNotification(`🚀 CASHOUT SUCCESSFUL! Rocket cashed at ${settledMultiplier}x! Won +$${finalPayout}!`, "success");
  };

  const settleCrashedRound = async (currentMultiplier: number) => {
    if (!onCashoutRound || !roundIdRef.current) return;
    const roundId = roundIdRef.current;
    roundIdRef.current = null;
    try {
      await onCashoutRound(roundId, currentMultiplier);
    } catch (error) {
      console.error('Crash loss settlement failed', error);
    }
  };

  const getCashoutPreview = () => resolveCrashCashout(
    asMoney(roundStakeRef.current),
    Math.min(multiplier, crashPointRef.current),
    crashPointRef.current
  );

  const drawFlightPath = (currMult: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw neon layout back grid
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.08)'; // faint neon rose grid
    ctx.lineWidth = 1;
    for (let x = 40; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 30; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Flight curve drawing parameters
    const progress = Math.min(1.0, (currMult - 1) / 5); // caps visual coordinate
    const startX = 20;
    const startY = h - 20;
    const endX = startX + progress * (w - 60);
    const endY = startY - parseFloat((Math.pow(progress, 1.8) * (h - 60)).toFixed(2));

    // Draw neon flight curve gradient outline
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(startX + (endX - startX) * 0.4, startY, endX, endY);

    const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
    gradient.addColorStop(0, '#3b82f6'); // neon blue
    gradient.addColorStop(0.5, '#ec4899'); // pink
    gradient.addColorStop(1, '#10b981'); // neon emerald green

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4.5;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ec4899';
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    // Draw the active flying Rocket circle indicator
    ctx.fillStyle = '#facc15'; // bright golden sun rocket
    ctx.beginPath();
    ctx.arc(endX, endY, 7.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(endX, endY, 8.5, 0, Math.PI * 2);
    ctx.stroke();
  };

  useEffect(() => {
    // Initial silent draw map
    drawFlightPath(1.0);
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  return (
    <div id="crash_multiplier_block" className="space-y-6">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Rocket className="h-44 w-44 text-rose-500 animate-spin" />
        </div>

        {/* Header telemetry info bar */}
        <div className="flex flex-wrap justify-between items-center gap-4 border-b border-neutral-800/80 pb-4 mb-6 relative z-10">
          <div>
            <h3 className="text-lg font-black uppercase text-neutral-100 flex items-center gap-1.5">
              <TrendingUp className="text-rose-500 h-5 w-5" />
              Cosmic Flight Crash Multiplier
            </h3>
            <p className="text-xs text-neutral-400">Lock your stake, watch the multiplier rise. Cashout before rocket implosion.</p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">History:</span>
            <div className="flex gap-1">
              {history.map((h, i) => (
                <span
                  key={i}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    h >= 2.0
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-950/40 text-rose-400 border-rose-500/20'
                  }`}
                >
                  {h}x
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* REAL-TIME CANVAS DISPLAY */}
        <div className="relative border border-neutral-800 bg-neutral-940 rounded-xl overflow-hidden shadow-inner mb-6 flex flex-col justify-between p-4 min-h-[220px]">
          {/* Main big multiplier text floating absolute */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
            {gameState === 'crashed' ? (
              <div className="text-center animate-scaleUp">
                <HeartCrack className="h-10 w-10 text-rose-500 mx-auto mb-1 animate-bounce" />
                <span className="text-xs uppercase font-extrabold text-neutral-500 tracking-widest">CRASHED AT</span>
                <span className="block text-4xl font-black text-rose-500 font-mono">{multiplier}x</span>
              </div>
            ) : (
              <div className="text-center">
                <span className="block text-5xl font-black tracking-tight text-yellow-400 font-mono animate-pulse">
                  {multiplier.toFixed(2)}x
                </span>
                {gameState === 'flying' && (
                  <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-widest animate-pulse mt-1.5 block">
                    📈 Active climbing flight...
                  </span>
                )}
              </div>
            )}
          </div>

          <canvas
            ref={canvasRef}
            width={450}
            height={180}
            className="w-full h-44 border-b border-neutral-800/40 rounded-t-lg bg-neutral-950/50"
          />
        </div>

        {/* WIN SUCCESS OUTCOME BAR */}
        <div className="h-10 flex items-center justify-center mb-4 relative z-10">
          {winAmount !== null && (
            <div className="animate-scaleUp bg-emerald-950/50 border border-emerald-500/40 text-emerald-400 font-black text-xs py-1.5 px-5 rounded-full flex items-center gap-1.5 shadow">
              <Sparkles className="h-3.5 w-3.5" />
              Successfully Cashed: +${winAmount}!
            </div>
          )}
        </div>

        {/* INPUT AND ACTIONS CONTROLS BAR */}
        <div className="bg-neutral-900/40 border border-neutral-800/60 p-4 rounded-xl relative z-10">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            {/* Bet entry selectors */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-neutral-400 uppercase font-bold">Stakes Bet:</span>
              <button
                disabled={gameState === 'flying'}
                onClick={() => setBet(Math.max(5, bet - 10))}
                className="bg-neutral-800 text-white font-mono hover:bg-neutral-700 disabled:opacity-40 py-1 px-2.5 rounded text-xs cursor-pointer"
              >
                -10
              </button>
              <div className="bg-neutral-950 border border-neutral-800 font-mono text-yellow-400 py-1.5 px-4 rounded text-sm font-bold min-w-16 text-center">
                ${bet}
              </div>
              <button
                disabled={gameState === 'flying'}
                onClick={() => setBet(Math.min(500, bet + 10))}
                className="bg-neutral-800 text-white font-mono hover:bg-neutral-700 disabled:opacity-40 py-1 px-2.5 rounded text-xs cursor-pointer"
              >
                +10
              </button>
            </div>

            {/* Launch / Cashout button */}
            {gameState !== 'flying' ? (
              <button
                onClick={handleStartFlight}
                className="w-full sm:w-auto bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white font-bold uppercase text-xs tracking-wider py-3 px-8 rounded-xl flex items-center justify-center gap-2 shadow cursor-pointer active:scale-95"
              >
                <Rocket className="h-4 w-4" />
                Place Stake & Launch
              </button>
            ) : (
              <button
                onClick={handleCashout}
                className="w-full sm:w-auto bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 text-neutral-950 font-black uppercase text-xs tracking-wider py-3 px-10 rounded-xl flex items-center justify-center gap-2 shadow cursor-pointer hover:scale-105 transition-all"
              >
                💰 CASHOUT IN-AIR ${getCashoutPreview()}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-neutral-905/30 border border-neutral-850 p-3 rounded-xl flex gap-2 items-center text-xs text-neutral-400">
        <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
        <span>
          Crash rounds resolve from a fixed hidden crash point generated at launch. Cashout before that point to settle the active stake.
        </span>
      </div>
    </div>
  );
}

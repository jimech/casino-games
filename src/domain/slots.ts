import { Money, asMoney, multiplyMoney } from './money';

export interface SlotSymbol {
  id: string;
  char: string;
  name: string;
  value: number;
  twoKindMultiplier: number;
  threeKindMultiplier: number;
  scatter?: boolean;
}

export interface SlotMachineConfig {
  id: string;
  name: string;
  theme: string;
  rtp: string;
  volatility: 'Low' | 'Medium' | 'High';
  minBet: Money;
  maxBet: Money;
  decor: string;
  symbols: SlotSymbol[];
  reelStrips: readonly [readonly string[], readonly string[], readonly string[]];
}

export interface SlotSpinOutcome {
  machineId: string;
  stops: [number, number, number];
  symbols: [string, string, string];
  payout: Money;
  bonusSpinsAwarded: number;
  bonusMultiplier: number;
}

export const SLOT_MACHINES: SlotMachineConfig[] = [
  {
    id: 'fruit-mania',
    name: 'Neon Fruit Mania',
    theme: 'fruit',
    rtp: '96.5%',
    volatility: 'Low',
    minBet: asMoney(5),
    maxBet: asMoney(100),
    decor: 'from-orange-500 via-pink-500 to-purple-600',
    symbols: [
      { id: 'cherry', char: '🍒', value: 3, name: 'Cherry', twoKindMultiplier: 1, threeKindMultiplier: 9 },
      { id: 'lemon', char: '🍋', value: 4, name: 'Lemon', twoKindMultiplier: 2, threeKindMultiplier: 12 },
      { id: 'watermelon', char: '🍉', value: 6, name: 'Watermelon', twoKindMultiplier: 3, threeKindMultiplier: 18 },
      { id: 'grapes', char: '🍇', value: 8, name: 'Grapes', twoKindMultiplier: 4, threeKindMultiplier: 24 },
      { id: 'diamond', char: '💎', value: 15, name: 'Diamond', twoKindMultiplier: 6, threeKindMultiplier: 45 },
      { id: 'bell', char: '🔔', value: 25, name: 'Bell', twoKindMultiplier: 10, threeKindMultiplier: 75 },
      { id: 'star', char: '⭐', value: 50, name: 'Scatter (Free Spins)', twoKindMultiplier: 0, threeKindMultiplier: 120, scatter: true }
    ],
    reelStrips: [
      ['cherry', 'lemon', 'cherry', 'watermelon', 'grapes', 'cherry', 'lemon', 'diamond', 'cherry', 'bell', 'lemon', 'watermelon', 'star', 'grapes', 'cherry'],
      ['lemon', 'cherry', 'watermelon', 'lemon', 'grapes', 'cherry', 'diamond', 'lemon', 'bell', 'cherry', 'watermelon', 'grapes', 'star', 'lemon', 'cherry'],
      ['cherry', 'watermelon', 'lemon', 'grapes', 'cherry', 'diamond', 'lemon', 'watermelon', 'bell', 'cherry', 'grapes', 'lemon', 'star', 'cherry', 'watermelon']
    ]
  },
  {
    id: 'cyber-jackpot',
    name: 'Cyber Jackpot 2077',
    theme: 'cyber',
    rtp: '95.0%',
    volatility: 'High',
    minBet: asMoney(20),
    maxBet: asMoney(500),
    decor: 'from-cyan-400 via-blue-600 to-indigo-900',
    symbols: [
      { id: 'battery', char: '🔋', value: 5, name: 'Battery', twoKindMultiplier: 1, threeKindMultiplier: 15 },
      { id: 'disk', char: '💾', value: 10, name: 'Disk', twoKindMultiplier: 2, threeKindMultiplier: 30 },
      { id: 'arm', char: '🦾', value: 20, name: 'Cyber Arm', twoKindMultiplier: 4, threeKindMultiplier: 60 },
      { id: 'deck', char: '💻', value: 40, name: 'Deck', twoKindMultiplier: 8, threeKindMultiplier: 120 },
      { id: 'visor', char: '🕶️', value: 75, name: 'Visor', twoKindMultiplier: 12, threeKindMultiplier: 225 },
      { id: 'core', char: '🌐', value: 150, name: 'Core Server', twoKindMultiplier: 20, threeKindMultiplier: 450 },
      { id: 'bolt', char: '⚡', value: 300, name: 'Scatter (Bonus Multip)', twoKindMultiplier: 0, threeKindMultiplier: 800, scatter: true }
    ],
    reelStrips: [
      ['battery', 'disk', 'battery', 'arm', 'disk', 'battery', 'deck', 'arm', 'battery', 'visor', 'disk', 'core', 'bolt', 'battery', 'arm', 'disk', 'battery', 'deck', 'arm', 'battery'],
      ['disk', 'battery', 'arm', 'disk', 'deck', 'battery', 'arm', 'visor', 'disk', 'battery', 'core', 'arm', 'battery', 'deck', 'bolt', 'disk', 'battery', 'arm', 'deck', 'battery'],
      ['battery', 'arm', 'disk', 'battery', 'deck', 'arm', 'disk', 'visor', 'battery', 'core', 'disk', 'arm', 'battery', 'deck', 'bolt', 'battery', 'disk', 'arm', 'battery', 'deck']
    ]
  },
  {
    id: 'ancient-gold',
    name: "Pharaoh's Neon Gold",
    theme: 'ancient',
    rtp: '97.2%',
    volatility: 'Medium',
    minBet: asMoney(10),
    maxBet: asMoney(250),
    decor: 'from-yellow-400 via-amber-600 to-red-600',
    symbols: [
      { id: 'urn', char: '🏺', value: 4, name: 'Urn', twoKindMultiplier: 1, threeKindMultiplier: 12 },
      { id: 'cobra', char: '🐍', value: 7, name: 'Cobra', twoKindMultiplier: 2, threeKindMultiplier: 21 },
      { id: 'scarab', char: '🦂', value: 12, name: 'Scarab', twoKindMultiplier: 4, threeKindMultiplier: 36 },
      { id: 'eye', char: '👁️', value: 25, name: 'Eye of Horus', twoKindMultiplier: 6, threeKindMultiplier: 75 },
      { id: 'camel', char: '🐪', value: 50, name: 'Camel', twoKindMultiplier: 10, threeKindMultiplier: 150 },
      { id: 'pharaoh', char: '👑', value: 100, name: 'Pharaoh Mask', twoKindMultiplier: 15, threeKindMultiplier: 300 },
      { id: 'trident', char: '🔱', value: 200, name: 'Scatter (Golden Key)', twoKindMultiplier: 0, threeKindMultiplier: 500, scatter: true }
    ],
    reelStrips: [
      ['urn', 'cobra', 'urn', 'scarab', 'cobra', 'eye', 'urn', 'camel', 'scarab', 'cobra', 'urn', 'pharaoh', 'trident', 'eye', 'urn', 'cobra', 'scarab'],
      ['cobra', 'urn', 'scarab', 'urn', 'eye', 'cobra', 'camel', 'urn', 'scarab', 'pharaoh', 'cobra', 'urn', 'trident', 'scarab', 'cobra', 'eye', 'urn'],
      ['urn', 'scarab', 'cobra', 'eye', 'urn', 'camel', 'cobra', 'scarab', 'urn', 'pharaoh', 'eye', 'cobra', 'trident', 'urn', 'scarab', 'cobra', 'eye']
    ]
  }
];

export const getSlotMachine = (machineId: string): SlotMachineConfig => {
  const machine = SLOT_MACHINES.find(candidate => candidate.id === machineId);
  if (!machine) throw new Error(`Unknown slot machine ${machineId}`);
  return machine;
};

export const resolveSlotSpin = (
  machine: SlotMachineConfig,
  bet: Money,
  stops: [number, number, number],
  bonusMultiplier = 1
): SlotSpinOutcome => {
  if (bet < machine.minBet || bet > machine.maxBet) {
    throw new Error(`Bet must be between ${machine.minBet} and ${machine.maxBet}`);
  }
  if (!Number.isInteger(bonusMultiplier) || bonusMultiplier < 1) {
    throw new Error(`Invalid slots bonus multiplier ${bonusMultiplier}`);
  }

  const symbols = stops.map((stop, index) => {
    const strip = machine.reelStrips[index];
    if (!Number.isInteger(stop) || stop < 0 || stop >= strip.length) {
      throw new Error(`Invalid stop ${stop} for reel ${index}`);
    }
    return strip[stop];
  }) as [string, string, string];

  const bonusSpinsAwarded = countScatters(machine, symbols) >= 2
    ? countScatters(machine, symbols) === 2 ? 5 : 12
    : 0;

  return {
    machineId: machine.id,
    stops,
    symbols,
    payout: multiplyMoney(bet, resolveLineMultiplier(machine, symbols) * bonusMultiplier),
    bonusSpinsAwarded,
    bonusMultiplier
  };
};

export const symbolIdsToChars = (machine: SlotMachineConfig, symbols: readonly string[]): [string, string, string] => {
  if (symbols.length !== 3) throw new Error('Slot spin must contain exactly three symbols');
  return symbols.map(symbolId => {
    const symbol = machine.symbols.find(candidate => candidate.id === symbolId);
    if (!symbol) throw new Error(`Unknown slot symbol ${symbolId}`);
    return symbol.char;
  }) as [string, string, string];
};

const resolveLineMultiplier = (machine: SlotMachineConfig, symbols: readonly string[]) => {
  const [first, second, third] = symbols;
  if (first === second && second === third) {
    return requireSymbol(machine, first).threeKindMultiplier;
  }
  const pair = first === second ? first : first === third ? first : second === third ? second : undefined;
  return pair ? requireSymbol(machine, pair).twoKindMultiplier : 0;
};

const countScatters = (machine: SlotMachineConfig, symbols: readonly string[]) => {
  const scatterIds = new Set(machine.symbols.filter(symbol => symbol.scatter).map(symbol => symbol.id));
  return symbols.filter(symbol => scatterIds.has(symbol)).length;
};

const requireSymbol = (machine: SlotMachineConfig, symbolId: string) => {
  const symbol = machine.symbols.find(candidate => candidate.id === symbolId);
  if (!symbol) throw new Error(`Unknown slot symbol ${symbolId}`);
  return symbol;
};

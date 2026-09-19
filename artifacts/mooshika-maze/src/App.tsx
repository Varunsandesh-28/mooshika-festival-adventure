import { type TouchEvent, useCallback, useEffect, useRef, useState } from 'react';

type Screen = 'start' | 'howto' | 'playing' | 'paused' | 'levelComplete' | 'gameOver' | 'final' | 'runnerPlaying' | 'runnerGameOver';
type PowerType = 'speed' | 'shield' | 'time' | 'mega';
type Position = { x: number; y: number };
type PowerUp = Position & { type: PowerType };
type RunnerObjectKind = 'modak' | 'coin' | 'golden' | 'obstacle' | 'arch' | 'speed' | 'blessing' | 'magnet' | 'dash';
type RunnerObject = { id: number; lane: number; z: number; kind: RunnerObjectKind; hit?: boolean };
type RunnerState = {
  lane: number;
  distance: number;
  score: number;
  modaks: number;
  coins: number;
  combo: number;
  speed: number;
  elapsed: number;
  jumpTimer: number;
  slideTimer: number;
  speedBoostTimer: number;
  blessingTimer: number;
  magnetTimer: number;
  dashTimer: number;
  objects: RunnerObject[];
  lastSpawn: number;
  nextObjectId: number;
  eventSlot: number;
  eventMessage: string;
  milestones: number[];
  over: boolean;
};

const WIDTH = 17;
const HEIGHT = 11;
const LEVEL_TIMES = [60, 55, 50, 45, 40];
const LEVEL_NAMES = ['Courtyard Gate', 'Marigold Walk', 'Moonlit Pillars', 'Bell Tower Turn', 'Festival Sanctum'];
const START: Position = { x: 1, y: 1 };
const GOAL: Position = { x: 15, y: 9 };
const posKey = (pos: Position) => `${pos.x}-${pos.y}`;
const samePos = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
const makeRunnerState = (): RunnerState => ({
  lane: 1, distance: 0, score: 0, modaks: 0, coins: 0, combo: 0, speed: 13, elapsed: 0,
  jumpTimer: 0, slideTimer: 0, speedBoostTimer: 0, blessingTimer: 0, magnetTimer: 0, dashTimer: 0,
  objects: [], lastSpawn: 0, nextObjectId: 1, eventSlot: -1, eventMessage: 'The festival road is yours. Keep your eyes on the next arch.',
  milestones: [], over: false,
});

const makeWalls = (level: number) => {
  const walls = new Set<string>();
  for (let x = 0; x < WIDTH; x++) {
    walls.add(posKey({ x, y: 0 }));
    walls.add(posKey({ x, y: HEIGHT - 1 }));
  }
  for (let y = 0; y < HEIGHT; y++) {
    walls.add(posKey({ x: 0, y }));
    walls.add(posKey({ x: WIDTH - 1, y }));
  }
  const vertical = (x: number, from: number, to: number, gaps: number[]) => {
    for (let y = from; y <= to; y++) if (!gaps.includes(y)) walls.add(posKey({ x, y }));
  };
  const horizontal = (y: number, from: number, to: number, gaps: number[]) => {
    for (let x = from; x <= to; x++) if (!gaps.includes(x)) walls.add(posKey({ x, y }));
  };
  if (level >= 2) {
    vertical(5, 2, 8, [5]);
    vertical(11, 2, 8, [3]);
  }
  if (level >= 3) {
    vertical(4, 2, 8, [6]);
    vertical(8, 2, 8, [3]);
    vertical(12, 2, 8, [6]);
    horizontal(4, 2, 14, [4, 10]);
    horizontal(7, 2, 14, [7, 12]);
  }
  if (level >= 4) {
    vertical(2, 2, 6, [2]);
    vertical(14, 4, 9, [8]);
    horizontal(2, 2, 6, [4]);
    horizontal(2, 10, 14, [12]);
    horizontal(8, 3, 13, [8]);
  }
  if (level >= 5) {
    vertical(6, 2, 8, [5]);
    vertical(10, 2, 8, [7]);
    horizontal(5, 2, 14, [3, 9, 13]);
  }
  return walls;
};

const LEVELS = [
  { modaks: [{ x: 3, y: 2 }, { x: 13, y: 3 }, { x: 8, y: 7 }], hazards: [] as Position[], powers: [] as PowerUp[] },
  { modaks: [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 14, y: 8 }, { x: 8, y: 8 }], hazards: [{ x: 7, y: 5 }, { x: 13, y: 6 }], powers: [{ x: 3, y: 8, type: 'speed' as PowerType }] },
  { modaks: [{ x: 2, y: 2 }, { x: 7, y: 3 }, { x: 10, y: 6 }, { x: 14, y: 8 }], hazards: [{ x: 3, y: 6 }, { x: 10, y: 3 }, { x: 13, y: 5 }], powers: [{ x: 3, y: 6, type: 'shield' as PowerType }, { x: 14, y: 2, type: 'time' as PowerType }] },
  { modaks: [{ x: 3, y: 3 }, { x: 7, y: 5 }, { x: 10, y: 6 }, { x: 13, y: 9 }, { x: 8, y: 2 }], hazards: [{ x: 3, y: 5 }, { x: 7, y: 3 }, { x: 13, y: 6 }, { x: 9, y: 9 }], powers: [{ x: 7, y: 6, type: 'mega' as PowerType }] },
  { modaks: [{ x: 2, y: 2 }, { x: 4, y: 9 }, { x: 7, y: 3 }, { x: 9, y: 6 }, { x: 13, y: 8 }, { x: 14, y: 2 }], hazards: [{ x: 3, y: 3 }, { x: 5, y: 6 }, { x: 9, y: 3 }, { x: 13, y: 5 }, { x: 14, y: 7 }], powers: [{ x: 3, y: 8, type: 'speed' as PowerType }, { x: 13, y: 3, type: 'shield' as PowerType }, { x: 8, y: 9, type: 'time' as PowerType }] },
].map((level, index) => ({ ...level, walls: makeWalls(index + 1) }));

const powerCopy: Record<PowerType, { name: string; symbol: string; description: string }> = {
  speed: { name: 'Quick paws', symbol: '»', description: 'Move two spaces for a short while.' },
  shield: { name: 'Temple guard', symbol: '◇', description: 'Ignore one obstacle strike.' },
  time: { name: 'Golden minute', symbol: '◷', description: 'Add twelve seconds to the clock.' },
  mega: { name: 'Mega modak', symbol: '★', description: 'A generous score offering.' },
};

function playTone(enabled: boolean, frequency: number, duration = 0.08) {
  if (!enabled || typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.045, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  window.setTimeout(() => void context.close(), duration * 1000 + 80);
}

function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [levelIndex, setLevelIndex] = useState(0);
  const [player, setPlayer] = useState<Position>(START);
  const [collected, setCollected] = useState<string[]>([]);
  const [collectedPowers, setCollectedPowers] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(LEVEL_TIMES[0]);
  const [lostLifeThisLevel, setLostLifeThisLevel] = useState(false);
  const [speedBoost, setSpeedBoost] = useState(0);
  const [shield, setShield] = useState(0);
  const [levelBonus, setLevelBonus] = useState(0);
  const [levelScores, setLevelScores] = useState<number[]>([]);
  const [finalScore, setFinalScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => Number(window.localStorage.getItem('mooshika-best-score') || 0));
  const [soundOn, setSoundOn] = useState(true);
  const [lastEvent, setLastEvent] = useState('Collect every modak to unlock the sanctum.');
  const eventTimer = useRef<number | undefined>(undefined);
  const [runnerView, setRunnerView] = useState<RunnerState>(() => makeRunnerState());
  const runnerRef = useRef<RunnerState>(runnerView);
  const [runnerBest, setRunnerBest] = useState(() => Number(window.localStorage.getItem('mooshika-run-best') || 0));
  const runnerTouch = useRef<{ x: number; y: number } | null>(null);

  const level = LEVELS[levelIndex];
  const levelTime = LEVEL_TIMES[levelIndex];
  const completedCount = collected.length;
  const runnerSectionNames = ['Marigold Mile', 'Temple Bridge', 'Rangoli Square', 'Diyas by the River', 'Golden Gate'];
  const runnerSection = runnerSectionNames[Math.floor(runnerView.distance / 160) % runnerSectionNames.length];
  const showEvent = useCallback((message: string) => {
    setLastEvent(message);
    if (eventTimer.current) window.clearTimeout(eventTimer.current);
    eventTimer.current = window.setTimeout(() => setLastEvent('Find the next offering and keep moving.'), 2800);
  }, []);

  const syncRunner = useCallback((next: RunnerState) => {
    runnerRef.current = next;
    setRunnerView(next);
  }, []);

  const startRunner = useCallback(() => {
    const next = makeRunnerState();
    runnerRef.current = next;
    setRunnerView(next);
    setScreen('runnerPlaying');
    playTone(soundOn, 494, 0.12);
  }, [soundOn]);

  const runnerLaneMove = useCallback((direction: number) => {
    if (screen !== 'runnerPlaying') return;
    const current = runnerRef.current;
    if (current.over) return;
    const nextLane = Math.max(0, Math.min(2, current.lane + direction));
    if (nextLane !== current.lane) {
      syncRunner({ ...current, lane: nextLane });
      playTone(soundOn, 310 + nextLane * 55, 0.045);
    }
  }, [screen, soundOn, syncRunner]);

  const runnerJump = useCallback(() => {
    if (screen !== 'runnerPlaying') return;
    const current = runnerRef.current;
    if (!current.over && current.jumpTimer <= 0 && current.slideTimer <= 0) {
      syncRunner({ ...current, jumpTimer: 0.7, combo: current.combo });
      playTone(soundOn, 620, 0.06);
    }
  }, [screen, soundOn, syncRunner]);

  const runnerSlide = useCallback(() => {
    if (screen !== 'runnerPlaying') return;
    const current = runnerRef.current;
    if (!current.over && current.slideTimer <= 0 && current.jumpTimer <= 0) {
      syncRunner({ ...current, slideTimer: 0.58 });
      playTone(soundOn, 220, 0.06);
    }
  }, [screen, soundOn, syncRunner]);

  const startGame = useCallback(() => {
    setLevelIndex(0);
    setPlayer(START);
    setCollected([]);
    setCollectedPowers([]);
    setScore(0);
    setLives(3);
    setTimeLeft(LEVEL_TIMES[0]);
    setLostLifeThisLevel(false);
    setSpeedBoost(0);
    setShield(0);
    setLevelScores([]);
    setFinalScore(0);
    setLastEvent('Collect every modak to unlock the sanctum.');
    setScreen('playing');
    playTone(soundOn, 392, 0.12);
  }, [soundOn]);

  const resetLevelPosition = useCallback((message: string) => {
    setPlayer(START);
    setTimeLeft(Math.max(15, levelTime - 8));
    setSpeedBoost(0);
    setLostLifeThisLevel(true);
    showEvent(message);
    playTone(soundOn, 145, 0.16);
  }, [levelTime, showEvent, soundOn]);

  const loseLife = useCallback((message: string) => {
    if (lives <= 1) {
      setLives(0);
      setFinalScore(score);
      setScreen('gameOver');
      playTone(soundOn, 110, 0.32);
      return;
    }
    setLives((current) => current - 1);
    resetLevelPosition(message);
  }, [lives, resetLevelPosition, score, soundOn]);

  const finishLevel = useCallback(() => {
    const bonus = 500 + timeLeft * 10 + (lostLifeThisLevel ? 0 : 250);
    const newTotal = score + bonus;
    setLevelBonus(bonus);
    setScore(newTotal);
    setLevelScores((scores) => [...scores, bonus]);
    playTone(soundOn, 660, 0.16);
    if (levelIndex === LEVELS.length - 1) {
      setFinalScore(newTotal);
      if (newTotal > bestScore) {
        setBestScore(newTotal);
        window.localStorage.setItem('mooshika-best-score', String(newTotal));
      }
      setScreen('final');
    } else {
      setScreen('levelComplete');
    }
  }, [bestScore, levelIndex, lostLifeThisLevel, score, soundOn, timeLeft]);

  const collectAt = useCallback((next: Position) => {
    const key = posKey(next);
    const modak = level.modaks.some((item) => posKey(item) === key);
    if (modak && !collected.includes(key)) {
      setCollected((items) => [...items, key]);
      setScore((current) => current + 100);
      showEvent('Modak collected. The path glimmers ahead.');
      playTone(soundOn, 560, 0.1);
    }
    const power = level.powers.find((item) => posKey(item) === key);
    if (power && !collectedPowers.includes(key)) {
      setCollectedPowers((items) => [...items, key]);
      if (power.type === 'speed') setSpeedBoost(18);
      if (power.type === 'shield') setShield(1);
      if (power.type === 'time') setTimeLeft((current) => current + 12);
      if (power.type === 'mega') setScore((current) => current + 300);
      showEvent(`${powerCopy[power.type].name} found. ${powerCopy[power.type].description}`);
      playTone(soundOn, 760, 0.12);
    }
    if (samePos(next, GOAL)) {
      if (collected.length + (modak && !collected.includes(key) ? 1 : 0) >= level.modaks.length) {
        finishLevel();
      } else {
        showEvent('The sanctum is sealed. Collect every modak first.');
        playTone(soundOn, 180, 0.1);
      }
    }
  }, [collected, collectedPowers, finishLevel, level, showEvent, soundOn]);

  const move = useCallback((dx: number, dy: number) => {
    if (screen !== 'playing') return;
    let next = player;
    const steps = speedBoost > 0 ? 2 : 1;
    for (let step = 0; step < steps; step++) {
      const candidate = { x: next.x + dx, y: next.y + dy };
      if (candidate.x < 0 || candidate.y < 0 || candidate.x >= WIDTH || candidate.y >= HEIGHT || level.walls.has(posKey(candidate))) break;
      next = candidate;
    }
    if (samePos(next, player)) return;
    setPlayer(next);
    if (speedBoost > 0) setSpeedBoost((current) => Math.max(0, current - 1));
    const hazard = level.hazards.some((item) => samePos(item, next));
    if (hazard) {
      if (shield > 0) {
        setShield(0);
        showEvent('Your temple guard absorbed the obstacle.');
        playTone(soundOn, 300, 0.11);
      } else {
        loseLife('An obstacle sent Mooshika back to the entrance.');
        return;
      }
    }
    collectAt(next);
    playTone(soundOn, 260 + next.x * 10, 0.035);
  }, [collectAt, level, loseLife, player, screen, shield, showEvent, soundOn, speedBoost]);

  useEffect(() => {
    if (screen !== 'playing') return undefined;
    const keyHandler = (event: KeyboardEvent) => {
      const directions: Record<string, [number, number]> = {
        ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
        ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
        ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
        ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
      };
      if (directions[event.key]) {
        event.preventDefault();
        move(...directions[event.key]);
      }
      if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') setScreen('paused');
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [move, screen]);

  useEffect(() => {
    if (screen !== 'runnerPlaying') return undefined;
    const keyHandler = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'].includes(event.key)) event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') runnerLaneMove(-1);
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') runnerLaneMove(1);
      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') runnerJump();
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') runnerSlide();
      if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') setScreen('start');
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [runnerJump, runnerLaneMove, runnerSlide, screen]);

  useEffect(() => {
    if (screen !== 'playing') return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          loseLife('The temple clock ran out. Mooshika returns to the entrance.');
          return levelTime;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [levelTime, loseLife, screen]);

  useEffect(() => {
    if (screen !== 'playing' || speedBoost <= 0) return undefined;
    const timer = window.setInterval(() => setSpeedBoost((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [screen, speedBoost]);

  useEffect(() => {
    if (screen !== 'runnerPlaying') return undefined;
    const timer = window.setInterval(() => {
      const current = runnerRef.current;
      if (current.over) return;
      const dt = 0.1;
      const difficulty = 1 + current.distance / 850;
      const next: RunnerState = {
        ...current,
        elapsed: current.elapsed + dt,
        distance: current.distance + (current.speed + current.distance / 180) * dt,
        jumpTimer: Math.max(0, current.jumpTimer - dt),
        slideTimer: Math.max(0, current.slideTimer - dt),
        speedBoostTimer: Math.max(0, current.speedBoostTimer - dt),
        blessingTimer: Math.max(0, current.blessingTimer - dt),
        magnetTimer: Math.max(0, current.magnetTimer - dt),
        dashTimer: Math.max(0, current.dashTimer - dt),
        objects: current.objects.map((object) => ({ ...object, z: object.z + (current.speed / 38) * dt * (current.dashTimer > 0 ? 1.45 : 1) })),
      };
      if (next.speedBoostTimer > 0) next.speed = 17;
      else next.speed = Math.min(25, 13 + next.distance / 260);

      const spawnEvery = Math.max(0.36, 0.82 - difficulty * 0.06);
      if (next.elapsed - next.lastSpawn >= spawnEvery && next.objects.length < 28) {
        const roll = Math.random();
        let kind: RunnerObjectKind = roll < 0.23 ? 'modak' : roll < 0.42 ? 'coin' : roll < 0.47 ? 'golden' : roll < 0.57 ? 'speed' : roll < 0.64 ? 'blessing' : roll < 0.7 ? 'magnet' : roll < 0.74 ? 'dash' : roll < 0.87 ? 'obstacle' : 'arch';
        if (next.distance < 40 && (kind === 'obstacle' || kind === 'arch')) kind = 'coin';
        next.objects = [...next.objects, { id: next.nextObjectId, lane: Math.floor(Math.random() * 3), z: 0.02, kind }];
        next.nextObjectId += 1;
        next.lastSpawn = next.elapsed;
      }

      let collision = false;
      let hitObstacle = false;
      const collectibleKinds: RunnerObjectKind[] = ['modak', 'coin', 'golden', 'speed', 'blessing', 'magnet', 'dash'];
      next.objects = next.objects.filter((object) => {
        if (object.z > 1.08) {
          if (collectibleKinds.includes(object.kind) && object.lane === next.lane) next.combo = 0;
          return false;
        }
        if (object.hit || object.z < 0.79) return true;
        const laneMatch = object.lane === next.lane;
        const magnetPull = next.magnetTimer > 0 && collectibleKinds.includes(object.kind);
        if (collectibleKinds.includes(object.kind) && (laneMatch || magnetPull)) {
          object.hit = true;
          if (object.kind === 'modak') { next.modaks += 1; next.score += 10; }
          if (object.kind === 'coin') { next.coins += 1; next.score += 5; }
          if (object.kind === 'golden') { next.modaks += 1; next.score += 100; next.eventMessage = 'Golden modak! A perfect festival offering.'; }
          if (object.kind === 'speed') { next.speedBoostTimer = 6; next.eventMessage = 'Speed boost! The drums are getting louder.'; }
          if (object.kind === 'blessing') { next.blessingTimer = 10; next.eventMessage = 'Ganesha blessing! One mistake will be forgiven.'; }
          if (object.kind === 'magnet') { next.magnetTimer = 8; next.eventMessage = 'Modak magnet active. Sweet things are coming closer.'; }
          if (object.kind === 'dash') { next.dashTimer = 4; next.score += 25; next.eventMessage = 'Divine dash! Mooshika runs like a spark.'; }
          next.combo += 1;
          return false;
        }
        if ((object.kind === 'obstacle' || object.kind === 'arch') && laneMatch) {
          const jumped = next.jumpTimer > 0;
          const slid = next.slideTimer > 0;
          const safe = next.dashTimer > 0 || (object.kind === 'arch' ? slid : jumped);
          if (!safe) {
            if (next.blessingTimer > 0) {
              next.blessingTimer = 0;
              next.eventMessage = 'Blessing protected Mooshika from a tumble.';
            } else {
              collision = true;
              hitObstacle = true;
            }
          } else {
            next.score += 15;
            next.combo += 1;
          }
          object.hit = true;
          return false;
        }
        return true;
      });

      const eventSlot = Math.floor(next.distance / 130);
      if (eventSlot > next.eventSlot) {
        next.eventSlot = eventSlot;
        next.eventMessage = ['Festival rush! Hold your lane.', 'Modak shower! Follow the sparkle.', 'Blessing bells! Keep the rhythm.'][eventSlot % 3];
      }
      [500, 1000, 2000].forEach((milestone) => {
        if (next.distance >= milestone && !next.milestones.includes(milestone)) {
          next.milestones = [...next.milestones, milestone];
          next.eventMessage = `${milestone}m milestone! The whole festival is cheering.`;
          next.score += milestone / 10;
        }
      });

      if (collision && hitObstacle) {
        next.over = true;
        const record = Math.max(runnerBest, next.score);
        if (record > runnerBest) {
          setRunnerBest(record);
          window.localStorage.setItem('mooshika-run-best', String(record));
        }
        playTone(soundOn, 120, 0.25);
        syncRunner(next);
        setScreen('runnerGameOver');
        return;
      }
      syncRunner(next);
    }, 100);
    return () => window.clearInterval(timer);
  }, [runnerBest, screen, soundOn, syncRunner]);

  const nextLevel = () => {
    const nextIndex = levelIndex + 1;
    setLevelIndex(nextIndex);
    setPlayer(START);
    setCollected([]);
    setCollectedPowers([]);
    setTimeLeft(LEVEL_TIMES[nextIndex]);
    setLostLifeThisLevel(false);
    setSpeedBoost(0);
    setShield(0);
    setLastEvent('A deeper chamber awaits. Watch the new turns.');
    setScreen('playing');
  };

  if (screen === 'start' || screen === 'howto') {
    return (
      <main className={`game-shell start-screen ${screen === 'howto' ? 'howto-screen' : ''}`}>
        <header className="topbar">
          <div className="brand" data-testid="brand-mark">
            <span className="brand-mark" aria-hidden="true">🐘</span>
            <span className="brand-copy"><strong>Mooshika Maze</strong><small>Ganesha’s Modak Adventure</small></span>
          </div>
          <div className="festival-stamp">A Ganesh Chaturthi game night</div>
        </header>
        <div className="festival-decor" aria-hidden="true">
          <span className="decor-flower flower-one">✿</span>
          <span className="decor-flower flower-two">✿</span>
          <span className="decor-diya diya-left">◒</span>
          <span className="decor-diya diya-right">◒</span>
          <span className="decor-modak modak-left">◆</span>
          <span className="decor-modak modak-right">◆</span>
          <span className="decor-rangoli">✧ · ✦ · ✧</span>
        </div>
        {screen === 'start' ? (
          <section className="start-layout" aria-labelledby="game-title">
            <div className="start-copy">
              <div className="eyebrow">The temple doors are open</div>
              <h1 className="game-title" id="game-title">🐭 MOOSHIKA <em>MAZE</em></h1>
              <p className="game-subtitle">GANESHA'S MODAK ADVENTURE</p>
              <p className="hero-subtitle">Help Mooshika collect every modak and reach Ganesha before the timer runs out.</p>
              <div className="hero-actions">
                <button className="btn btn-primary start-cta" type="button" onClick={startGame} data-testid="button-start-game">START ADVENTURE</button>
                <button className="btn btn-runner" type="button" onClick={startRunner} data-testid="button-start-run">START RUN <span aria-hidden="true">→</span></button>
                <button className="btn btn-ghost" type="button" onClick={() => setScreen('howto')} data-testid="button-how-to-play">HOW TO PLAY</button>
              </div>
              <div className="best-score" data-testid="text-best-score">Best festival score <b>{bestScore.toLocaleString()}</b></div>
            </div>
            <div className="hero-art" aria-label="Ganesha and Mooshika illustration">
              <div className="art-halo" />
              <span className="art-modak one" aria-hidden="true">✦</span>
              <span className="art-modak two" aria-hidden="true">✦</span>
              <span className="art-modak three" aria-hidden="true">✦</span>
              <span className="art-ganesha" aria-hidden="true">🐘</span>
              <span className="art-mouse" aria-hidden="true">🐭</span>
              <span className="art-note">Five doors. One offering. A very brave mouse.</span>
            </div>
          </section>
        ) : (
          <section className="howto-panel" aria-labelledby="howto-title">
            <div className="eyebrow">Before you enter</div>
            <h2 id="howto-title">How to play</h2>
            <ul className="howto-steps">
              <li>Use Arrow Keys or WASD to move Mooshika.</li>
              <li>Collect all the modaks.</li>
              <li>Avoid obstacles.</li>
              <li>Reach Ganesha after collecting every modak.</li>
              <li>Complete the level before the timer reaches zero.</li>
            </ul>
            <div className="howto-tip">On mobile, use the directional pad below the maze. Press P or Escape to pause. For the new three-lane run, swipe left or right to switch lanes and swipe up or down to jump or slide.</div>
            <div className="howto-actions">
              <button className="btn btn-primary" type="button" onClick={startGame} data-testid="button-howto-start">START ADVENTURE</button>
              <button className="btn btn-runner" type="button" onClick={startRunner} data-testid="button-howto-run">START RUN</button>
              <button className="btn btn-ghost" type="button" onClick={() => setScreen('start')} data-testid="button-back-home">Back to title</button>
            </div>
          </section>
        )}
      </main>
    );
  }

  if (screen === 'runnerPlaying' || screen === 'runnerGameOver') {
    const runnerEnded = screen === 'runnerGameOver';
    const touchStart = (event: TouchEvent<HTMLElement>) => {
      const touch = event.changedTouches[0];
      runnerTouch.current = { x: touch.clientX, y: touch.clientY };
    };
    const touchEnd = (event: TouchEvent<HTMLElement>) => {
      const start = runnerTouch.current;
      const touch = event.changedTouches[0];
      runnerTouch.current = null;
      if (!start) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) runnerLaneMove(dx > 0 ? 1 : -1);
      else if (dy < 0) runnerJump();
      else runnerSlide();
    };
    const objectSymbol = (kind: RunnerObjectKind) => {
      if (kind === 'modak') return '◆';
      if (kind === 'coin') return '●';
      if (kind === 'golden') return '✦';
      if (kind === 'obstacle') return '▲';
      if (kind === 'arch') return '⌒';
      if (kind === 'speed') return '»';
      if (kind === 'blessing') return '◇';
      if (kind === 'magnet') return '⊙';
      return '↗';
    };
    return (
      <main className="game-shell runner-shell">
        <header className="topbar runner-topbar">
          <div className="brand" data-testid="runner-brand">
            <span className="brand-mark" aria-hidden="true">M</span>
            <span className="brand-copy"><strong>Mooshika: Modak Run</strong><small>Ganesha’s Festival Adventure</small></span>
          </div>
          <div className="runner-toolbar">
            <span className="runner-best">Best <b>{runnerBest.toLocaleString()}</b></span>
            <button className="icon-btn" type="button" onClick={() => { setSoundOn((current) => !current); playTone(!soundOn, 520, 0.08); }} aria-pressed={soundOn} data-testid="button-runner-sound">{soundOn ? 'Sound on' : 'Sound off'}</button>
            <button className="icon-btn" type="button" onClick={() => setScreen('start')} data-testid="button-runner-menu">Main menu</button>
          </div>
        </header>

        <section className="runner-page" aria-label="Mooshika Modak Run">
          <div className="runner-heading">
            <div>
              <div className="eyebrow">A three-lane festival sprint</div>
              <h1>MOOSHIKA: <em>MODAK RUN</em></h1>
              <p>GANESHA'S FESTIVAL ADVENTURE</p>
            </div>
            <div className="runner-section-tag"><span>Now passing</span><b>{runnerSection}</b></div>
          </div>
          <div className="runner-hud" aria-label="Run status">
            <div className="runner-stat"><span>Distance</span><b data-testid="status-run-distance">{Math.floor(runnerView.distance)}m</b></div>
            <div className="runner-stat"><span>Score</span><b data-testid="status-run-score">{runnerView.score.toLocaleString()}</b></div>
            <div className="runner-stat"><span>Modaks</span><b data-testid="status-run-modaks">{runnerView.modaks}</b></div>
            <div className="runner-stat"><span>Coins</span><b data-testid="status-run-coins">{runnerView.coins}</b></div>
            <div className="runner-stat combo-stat"><span>Combo</span><b data-testid="status-run-combo">×{runnerView.combo}</b></div>
            <div className="runner-stat"><span>Best</span><b data-testid="status-run-best">{runnerBest.toLocaleString()}</b></div>
          </div>

          <div className={`runner-stage ${runnerView.jumpTimer > 0 ? 'is-jumping' : ''} ${runnerView.slideTimer > 0 ? 'is-sliding' : ''}`} onTouchStart={touchStart} onTouchEnd={touchEnd}>
            <div className="runner-sky" aria-hidden="true">
              <span className="sky-moon">◐</span><span className="sky-star star-a">✦</span><span className="sky-star star-b">·</span><span className="sky-star star-c">✧</span>
              <span className="runner-banner banner-a">GANPATI BAPPA MORIYA</span>
              <span className="runner-banner banner-b">ॐ　✿　ॐ　✿　ॐ</span>
              <span className="runner-tree tree-a">♣</span><span className="runner-tree tree-b">♣</span>
            </div>
            <div className="runner-arch arch-back" aria-hidden="true">⌒</div>
            <div className="runner-arch arch-front" aria-hidden="true">⌒</div>
            <div className="runner-lights" aria-hidden="true">·　•　·　•　·　•　·　•　·</div>
            <div className="runner-track">
              <div className="track-rangoli" aria-hidden="true">✧　·　✦　·　✧</div>
              <div className="track-bridge" aria-hidden="true">╱╲╱╲╱╲╱╲╱╲</div>
              {[0, 1, 2].map((lane) => <div className={`runner-lane lane-${lane}`} key={lane}><span className="lane-diya">◒</span><span className="lane-flower">✿</span></div>)}
              {runnerView.objects.map((object) => (
                <div
                  className={`runner-object runner-object-${object.kind} ${object.hit ? 'collected' : ''}`}
                  key={object.id}
                  style={{ left: `${16.66 + object.lane * 33.34}%`, top: `${18 + object.z * 64}%`, transform: `translate(-50%, -50%) scale(${0.48 + object.z * 0.8})` }}
                  aria-label={object.kind}
                >
                  <span>{objectSymbol(object.kind)}</span>
                </div>
              ))}
              <div className={`runner-player lane-position-${runnerView.lane}`} aria-label="Mooshika runner">
                <span className="mouse-ear ear-left" /><span className="mouse-ear ear-right" /><span className="mouse-face">M</span>
              </div>
            </div>
            <div className="runner-event" aria-live="polite" data-testid="status-run-event">{runnerView.eventMessage}</div>
            <div className="runner-power-strip" aria-label="Active powers">
              {runnerView.speedBoostTimer > 0 && <span>Speed boost <b>{Math.ceil(runnerView.speedBoostTimer)}s</b></span>}
              {runnerView.blessingTimer > 0 && <span>Ganesha blessing <b>ready</b></span>}
              {runnerView.magnetTimer > 0 && <span>Modak magnet <b>{Math.ceil(runnerView.magnetTimer)}s</b></span>}
              {runnerView.dashTimer > 0 && <span>Divine dash <b>{Math.ceil(runnerView.dashTimer)}s</b></span>}
            </div>
          </div>

          <div className="runner-controls" aria-label="Touch controls">
            <button type="button" className="runner-control" onClick={() => runnerLaneMove(-1)} aria-label="Move to left lane" data-testid="button-run-left">←</button>
            <button type="button" className="runner-control runner-action" onClick={runnerJump} aria-label="Jump" data-testid="button-run-jump">Jump</button>
            <button type="button" className="runner-control runner-action" onClick={runnerSlide} aria-label="Slide" data-testid="button-run-slide">Slide</button>
            <button type="button" className="runner-control" onClick={() => runnerLaneMove(1)} aria-label="Move to right lane" data-testid="button-run-right">→</button>
          </div>
          <p className="runner-help">Arrow / A D to change lanes　·　ArrowUp / W to jump　·　ArrowDown / S to slide　·　Swipe on the track</p>
        </section>

        {runnerEnded && (
          <div className="overlay runner-overlay" role="dialog" aria-modal="true" aria-labelledby="runner-over-title">
            <div className="modal-panel runner-over-panel">
              <span className="modal-art" aria-hidden="true">✦</span>
              <div className="modal-kicker">The drums still echo</div>
              <h2 id="runner-over-title">Run complete</h2>
              <p>Mooshika reached {Math.floor(runnerView.distance)} metres through {runnerSection}.</p>
              <div className="runner-results">
                <div><span>Score</span><b>{runnerView.score.toLocaleString()}</b></div>
                <div><span>Best</span><b>{runnerBest.toLocaleString()}</b></div>
                <div><span>Modaks</span><b>{runnerView.modaks}</b></div>
                <div><span>Coins</span><b>{runnerView.coins}</b></div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" type="button" onClick={startRunner} data-testid="button-run-again">Play again</button>
                <button className="btn btn-ghost" type="button" onClick={() => setScreen('start')} data-testid="button-run-home">Main menu</button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  const paused = screen === 'paused';
  const goalUnlocked = completedCount === level.modaks.length;

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand" data-testid="brand-mark">
          <span className="brand-mark" aria-hidden="true">🐘</span>
          <span className="brand-copy"><strong>Mooshika Maze</strong><small>Ganesha’s Modak Adventure</small></span>
        </div>
        <div className="festival-stamp">Temple run in progress</div>
      </header>

      <section className="play-page" aria-label="Mooshika maze game">
        <div className="game-top">
          <div className="stat-card level"><div className="label">Chamber</div><div className="value">{levelIndex + 1} / 5</div></div>
          <div className="stat-card"><div className="label">Modaks</div><div className="value" data-testid="status-modak-count">{completedCount} / {level.modaks.length}</div></div>
          <div className={`stat-card timer-card ${timeLeft <= 10 ? 'urgent' : ''}`}><div className="label">Time</div><div className="value" data-testid="status-time">{String(timeLeft).padStart(2, '0')}s</div></div>
          <div className="stat-card"><div className="label">Score</div><div className="value" data-testid="status-score">{score.toLocaleString()}</div></div>
          <div className="stat-card"><div className="label">Lives</div><div className="life-dots" aria-label={`${lives} lives remaining`} data-testid="status-lives">{[0, 1, 2].map((life) => <span className={`life-dot ${life >= lives ? 'empty' : ''}`} key={life} />)}</div></div>
          <div className="toolbar">
            <button className="icon-btn" type="button" onClick={() => setScreen(paused ? 'playing' : 'paused')} data-testid="button-pause">{paused ? 'Resume' : 'Pause'}</button>
            <button className="icon-btn" type="button" onClick={startGame} data-testid="button-restart">Restart</button>
            <button className="icon-btn" type="button" onClick={() => { setSoundOn((current) => !current); playTone(!soundOn, 520, 0.08); }} aria-pressed={soundOn} data-testid="button-sound">{soundOn ? 'Sound on' : 'Sound off'}</button>
          </div>
        </div>

        <div className="board-layout">
          <div>
            <div className="board-frame">
              <div className="maze-grid" role="grid" aria-label={`${LEVEL_NAMES[levelIndex]} maze`} data-testid="maze-board">
                {Array.from({ length: WIDTH * HEIGHT }, (_, index) => {
                  const x = index % WIDTH;
                  const y = Math.floor(index / WIDTH);
                  const here = { x, y };
                  const key = posKey(here);
                  const isWall = level.walls.has(key);
                  const isPlayer = samePos(player, here);
                  const isGoal = samePos(GOAL, here);
                  const modak = level.modaks.some((item) => samePos(item, here)) && !collected.includes(key);
                  const power = level.powers.find((item) => samePos(item, here) && !collectedPowers.includes(posKey(item)));
                  const hazard = level.hazards.some((item) => samePos(item, here));
                  let className = `maze-cell ${isWall ? 'wall' : 'floor'}`;
                  if (isGoal) className += ' goal';
                  if (isPlayer) className += ' player';
                  if (modak) className += ' modak';
                  if (power) className += ' power';
                  if (hazard) className += ' hazard';
                  return (
                    <div className={className} role="gridcell" key={key} data-testid={`maze-cell-${key}`}>
                      {isWall ? null : isPlayer ? <span className="cell-art" aria-label="Mooshika">🐭</span> : isGoal ? <><span className="cell-art" aria-label="Ganesha">🐘</span><span className="goal-mark">{goalUnlocked ? 'open' : 'sealed'}</span></> : modak ? <span className="cell-art" aria-label="modak">🍡</span> : power ? <span className="cell-art" aria-label={powerCopy[power.type].name}>{powerCopy[power.type].symbol}</span> : hazard ? <span className="cell-art" aria-label="obstacle">▲</span> : (x === 1 && y === 1) ? <span className="start-mark">start</span> : null}
                    </div>
                  );
                })}
              </div>
              <div className="power-strip" aria-live="polite" data-testid="status-power-ups">
                {speedBoost > 0 && <span className="power-pill">Quick paws <b>{speedBoost}s</b></span>}
                {shield > 0 && <span className="power-pill">Temple guard <b>ready</b></span>}
                <span className="power-pill" data-testid="text-game-message">{lastEvent}</span>
              </div>
            </div>
            <div className="dpad" aria-label="Mobile movement controls">
              <button className="dpad-up" type="button" onClick={() => move(0, -1)} aria-label="Move up" data-testid="button-move-up">↑</button>
              <button className="dpad-left" type="button" onClick={() => move(-1, 0)} aria-label="Move left" data-testid="button-move-left">←</button>
              <button className="dpad-center" type="button" onClick={() => setScreen(paused ? 'playing' : 'paused')} aria-label="Pause game" data-testid="button-dpad-pause">•</button>
              <button className="dpad-right" type="button" onClick={() => move(1, 0)} aria-label="Move right" data-testid="button-move-right">→</button>
              <button className="dpad-down" type="button" onClick={() => move(0, 1)} aria-label="Move down" data-testid="button-move-down">↓</button>
            </div>
          </div>
          <aside className="side-panel">
            <div className="info-card">
              <h3>{LEVEL_NAMES[levelIndex]}</h3>
              <div className={`goal-locked ${goalUnlocked ? 'unlocked' : ''}`} data-testid="status-goal">{goalUnlocked ? 'Sanctum unlocked' : 'Sanctum sealed'}</div>
              <p style={{ marginTop: 10 }}>{goalUnlocked ? 'The offering is complete. Find the gold tile.' : 'The gold tile opens once every offering is gathered.'}</p>
            </div>
            <div className="info-card">
              <h3>Temple marks</h3>
              <div className="legend">
                <div className="legend-line"><span className="legend-symbol">◆</span> Modak offering</div>
                <div className="legend-line"><span className="legend-symbol">G</span> Ganesha’s sanctum</div>
                <div className="legend-line"><span className="legend-symbol">▲</span> Obstacle</div>
                <div className="legend-line"><span className="legend-symbol">★</span> Power-up</div>
              </div>
            </div>
            <div className="info-card">
              <h3>Controls</h3>
              <p className="controls-note">Arrow keys or WASD to move. Press P or Escape to pause. Collecting a modak is worth 100 points.</p>
            </div>
          </aside>
        </div>
      </section>

      {paused && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div className="modal-panel">
            <span className="modal-art" aria-hidden="true">⏸</span>
            <div className="modal-kicker">The temple waits</div>
            <h2 id="pause-title">Game paused</h2>
            <p>Take a breath. Your clock is safe while you plan the next turn.</p>
            <div className="modal-actions">
              <button className="btn btn-primary" type="button" onClick={() => setScreen('playing')} data-testid="button-resume">Resume</button>
              <button className="btn btn-ghost" type="button" onClick={startGame} data-testid="button-pause-restart">Restart run</button>
            </div>
          </div>
        </div>
      )}

      {screen === 'levelComplete' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="level-complete-title">
          <div className="modal-panel">
            <span className="modal-art" aria-hidden="true">✦</span>
            <div className="modal-kicker">Chamber cleared</div>
            <h2 id="level-complete-title">A sweet victory</h2>
            <p>You gathered every offering and reached the sanctum with {timeLeft} seconds left.</p>
            <div className="modal-score">+{levelBonus.toLocaleString()} points</div>
            <div className="modal-actions">
              <button className="btn btn-primary" type="button" onClick={nextLevel} data-testid="button-next-level">Enter chamber {levelIndex + 2}</button>
            </div>
          </div>
        </div>
      )}

      {screen === 'gameOver' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
          <div className="modal-panel">
            <span className="modal-art" aria-hidden="true">🐭</span>
            <div className="modal-kicker">The lamps have dimmed</div>
            <h2 id="game-over-title">The maze wins this round</h2>
            <p>Mooshika made it to chamber {levelIndex + 1}. The temple will keep your place for the next run.</p>
            <div className="modal-score">Score {finalScore.toLocaleString()}</div>
            <div className="modal-actions">
              <button className="btn btn-primary" type="button" onClick={startGame} data-testid="button-try-again">Try again</button>
              <button className="btn btn-ghost" type="button" onClick={() => setScreen('start')} data-testid="button-gameover-home">Home</button>
            </div>
          </div>
        </div>
      )}

      {screen === 'final' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="final-title">
          <div className="modal-panel">
            <span className="modal-art" aria-hidden="true">🐘</span>
            <div className="modal-kicker">Festival complete</div>
            <h2 id="final-title">The offering is delivered</h2>
            <p>Five chambers, every modak, and a very happy Ganesha.</p>
            <div className="results-grid">
              <div className="result-box"><span>Final score</span><strong>{finalScore.toLocaleString()}</strong></div>
              <div className="result-box"><span>Best score</span><strong>{bestScore.toLocaleString()}</strong></div>
            </div>
            <div className="progress-list">
              {LEVEL_NAMES.map((name, index) => <div className="progress-row" key={name}><span className="progress-dot" /><span>Chamber {index + 1}: {name}</span><b>cleared</b></div>)}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" type="button" onClick={startGame} data-testid="button-play-again">Play again</button>
              <button className="btn btn-ghost" type="button" onClick={() => setScreen('start')} data-testid="button-final-home">Home</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
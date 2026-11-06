// Pure game rules + state. The whole object is JSON so it survives a page refresh.
import { POINTS } from './data.js';

// The three ways to split 4 couples into 2 pairs; with side swaps that's 6 outcomes.
const SPLITS = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

export function newGame() {
  return {
    phase: 'menu',
    teams: [[0, 2], [1, 3]],
    scores: [0, 0],
    turn: 0,
    used: {},
    doubleKey: null,
    askUsed: [false, false],
    history: [],
    shuffleCount: 0,
    current: null,
    final: null,
    finalDone: false,
  };
}

export function shuffleTeams(g) {
  const prevKey = JSON.stringify(g.teams);
  let teams;
  do {
    const split = SPLITS[Math.floor(Math.random() * SPLITS.length)];
    teams = Math.random() < 0.5 ? [split[0], split[1]] : [split[1], split[0]];
  } while (JSON.stringify(teams) === prevKey);
  g.teams = teams.map((t) => [...t]);
  g.shuffleCount++;
  return g.teams;
}

export function teamOfCouple(g, couple) {
  return g.teams[0].includes(couple) ? 0 : 1;
}

export function startBoard(g, settings) {
  g.phase = 'board';
  g.scores = [0, 0];
  g.used = {};
  g.turn = Math.random() < 0.5 ? 0 : 1;
  g.askUsed = [false, false];
  g.history = [];
  g.current = null;
  g.final = null;
  g.finalDone = false;
  // Double Trouble hides on a tile worth 200+ points.
  g.doubleKey = settings.doubleTrouble ? `${Math.floor(Math.random() * 5)}-${1 + Math.floor(Math.random() * 4)}` : null;
}

export function remaining(g) {
  return 25 - Object.keys(g.used).filter((k) => g.used[k]).length;
}

function snapshot(g) {
  g.history.push(JSON.stringify({ scores: g.scores, used: g.used, turn: g.turn, askUsed: g.askUsed }));
  if (g.history.length > 40) g.history.shift();
}

export function undo(g) {
  const last = g.history.pop();
  if (!last) return false;
  Object.assign(g, JSON.parse(last));
  g.current = null;
  return true;
}

export function pickTile(g, c, r) {
  const key = `${c}-${r}`;
  if (g.used[key]) return null;
  snapshot(g);
  const double = key === g.doubleKey;
  g.current = {
    c,
    r,
    key,
    points: POINTS[r] * (double ? 2 : 1),
    double,
    picker: g.turn,
    answering: g.turn,
    stolen: false,
    revealed: false,
    resolved: false,
  };
  g.phase = 'question';
  return g.current;
}

/** @returns {{team:number, delta:number}} */
export function markCorrect(g) {
  const cur = g.current;
  if (!cur || cur.resolved) return null;
  g.scores[cur.answering] += cur.points;
  cur.resolved = true;
  return { team: cur.answering, delta: cur.points };
}

/** @returns {{team:number, delta:number, steal:boolean}} */
export function markWrong(g, settings) {
  const cur = g.current;
  if (!cur || cur.resolved) return null;
  const team = cur.answering;
  const delta = settings.wrongPenalty ? -cur.points : 0;
  g.scores[team] += delta;
  if (settings.stealing && !cur.stolen) {
    cur.stolen = true;
    cur.answering = 1 - team;
    return { team, delta, steal: true };
  }
  cur.resolved = true;
  return { team, delta, steal: false };
}

export function skipQuestion(g) {
  if (g.current) g.current.resolved = true;
}

export function finishQuestion(g) {
  const cur = g.current;
  if (!cur) return;
  g.used[cur.key] = true;
  g.turn = 1 - cur.picker;
  g.current = null;
  g.phase = 'board';
}

export function cancelQuestion(g) {
  // Back out without using the tile (host mis-click)
  if (!g.current) return;
  g.history.pop();
  g.current = null;
  g.phase = 'board';
}

export function useAskTheBoys(g, team) {
  if (g.askUsed[team]) return false;
  g.askUsed[team] = true;
  return true;
}

export function adjustScore(g, team, delta) {
  snapshot(g);
  g.scores[team] += delta;
}

// ---------- Final Splash ----------
export function startFinal(g) {
  g.phase = 'final';
  g.final = { stage: 'intro', wagers: [null, null], results: [null, null] };
}

export function maxWager(g, team) {
  return Math.max(0, g.scores[team]);
}

export function setWager(g, team, amount) {
  g.final.wagers[team] = Math.max(0, Math.min(maxWager(g, team), Math.round(amount || 0)));
}

export function resolveFinal(g, team, correct) {
  if (g.final.results[team] !== null) return;
  g.final.results[team] = correct;
  g.scores[team] += (correct ? 1 : -1) * (g.final.wagers[team] || 0);
}

export function winner(g) {
  if (g.scores[0] === g.scores[1]) return -1;
  return g.scores[0] > g.scores[1] ? 0 : 1;
}

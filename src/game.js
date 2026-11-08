// Pure game rules + state. The whole object is JSON so it survives a page refresh.
import { POINTS } from './data.js';

export function newGame() {
  return {
    phase: 'menu',
    teams: [[], []], // character indices per team (random, not tied to couples); filled by shuffleTeams
    scores: [0, 0],
    turn: 0,
    pickIdx: [0, 0], // whose turn it is inside each team (everyone takes turns)
    people: true, // teams hold people, not couples (older saves held couple indices)
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

/** Random teams: everybody shuffled, split as evenly as possible (never the same split twice in a row). */
export function shuffleTeams(g, count) {
  const norm = (t) => JSON.stringify(t.map((x) => [...x].sort((a, b) => a - b)));
  const prevKey = norm(g.teams || [[], []]);
  let teams;
  let tries = 0;
  do {
    const ids = Array.from({ length: count }, (_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const half = Math.ceil(count / 2);
    teams = Math.random() < 0.5 ? [ids.slice(0, half), ids.slice(half)] : [ids.slice(half), ids.slice(0, half)];
  } while (norm(teams) === prevKey && ++tries < 20);
  g.teams = teams;
  g.people = true;
  g.shuffleCount++;
  return g.teams;
}

export function teamOf(g, person) {
  return g.teams[0].includes(person) ? 0 : 1;
}

export function startBoard(g, settings) {
  g.phase = 'board';
  g.scores = [0, 0];
  g.used = {};
  g.turn = Math.random() < 0.5 ? 0 : 1;
  g.pickIdx = [0, 0];
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
  g.history.push(JSON.stringify({ scores: g.scores, used: g.used, turn: g.turn, askUsed: g.askUsed, pickIdx: g.pickIdx }));
  if (g.history.length > 40) g.history.shift();
}

export function undo(g) {
  const last = g.history.pop();
  if (!last) return false;
  Object.assign(g, JSON.parse(last));
  g.current = null;
  return true;
}

/** Character index (into the characters list) who plays for `team` right now — everyone takes turns. */
export function activePlayer(g, team) {
  const list = g.teams[team] || [];
  if (!list.length) return 0;
  return list[((g.pickIdx || [0, 0])[team] || 0) % list.length];
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
  g.pickIdx = g.pickIdx || [0, 0];
  g.pickIdx[cur.picker] = (g.pickIdx[cur.picker] || 0) + 1;
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

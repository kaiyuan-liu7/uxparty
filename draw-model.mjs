/** Pure, shared draw rules for 欢乐 VAU. */
export const PEOPLE = Object.freeze([
  { id: 'chenyan', name: '晨妍' },
  { id: 'linyi', name: '林壹' },
  { id: 'yining', name: '以宁' },
  { id: 'siyuan', name: '思远' },
  { id: 'xifan', name: '西帆' },
  { id: 'yunshu', name: '云舒' },
  { id: 'kaiyuan', name: '开源' },
  { id: 'yujie', name: '雨杰' },
].map(person => Object.freeze(person)));

const VALID_IDS = new Set(PEOPLE.map(person => person.id));
const FULL_TURN = 360;
const SECTOR_DEGREES = FULL_TURN / PEOPLE.length;

/** Recover a safe, ordered list from untrusted persisted data. */
export function sanitizeDraws(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const result = [];
  for (const id of input) {
    if (typeof id !== 'string' || !VALID_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length === PEOPLE.length) break;
  }
  return result;
}

export function getCandidates(draws = []) {
  const selected = new Set(sanitizeDraws(draws));
  return PEOPLE.filter(person => !selected.has(person.id));
}

/** Rejection sampling avoids modulo bias while keeping browser/Node parity. */
function secureRandomIndex(length) {
  if (length === 1) return 0;
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random numbers are unavailable in this environment.');
  }
  const range = 0x100000000;
  const limit = range - (range % length);
  const sample = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(sample);
  } while (sample[0] >= limit);
  return sample[0] % length;
}

/** The previous winner stays excluded until the replacement is committed. */
export function chooseCandidate(draws = [], { reroll = false, randomIndex = secureRandomIndex } = {}) {
  const cleanDraws = sanitizeDraws(draws);
  if (reroll && cleanDraws.length === 0) return null;
  const candidates = getCandidates(cleanDraws);
  if (candidates.length === 0) return null;
  if (typeof randomIndex !== 'function') throw new TypeError('randomIndex must be a function.');
  const index = randomIndex(candidates.length);
  if (!Number.isInteger(index) || index < 0 || index >= candidates.length) {
    throw new RangeError('randomIndex returned an index outside the candidate pool.');
  }
  return candidates[index];
}

/** Commit a completed animation without mutating existing history. */
export function commitDraw(draws, winnerId, { reroll = false } = {}) {
  const cleanDraws = sanitizeDraws(draws);
  if (!Array.isArray(draws) || cleanDraws.length !== draws.length) {
    throw new TypeError('Draw history must contain unique, valid participant IDs.');
  }
  if (reroll && cleanDraws.length === 0) {
    throw new Error('A reroll requires an existing round.');
  }
  if (!VALID_IDS.has(winnerId)) throw new Error('Unknown participant.');
  if (!getCandidates(cleanDraws).some(person => person.id === winnerId)) {
    throw new Error('This participant is not available for this draw.');
  }
  return reroll
    ? [...cleanDraws.slice(0, -1), winnerId]
    : [...cleanDraws, winnerId];
}

const normalizeDegrees = value => ((value % FULL_TURN) + FULL_TURN) % FULL_TURN;

/**
 * Sector 0 is centered at the top; sectors increase clockwise.
 * CSS positive rotation is clockwise, so the target is -index * 45°.
 */
export function angleForWinner(currentRotation, index, jitter = 0, turns = 6) {
  if (!Number.isFinite(currentRotation)) throw new TypeError('Rotation must be finite.');
  if (!Number.isInteger(index) || index < 0 || index >= PEOPLE.length) {
    throw new RangeError('Winner index is outside the wheel.');
  }
  if (!Number.isFinite(turns)) throw new TypeError('Turn count must be finite.');
  const numericJitter = Number(jitter);
  const clampedJitter = Number.isNaN(numericJitter) ? 0 : Math.max(-12, Math.min(12, numericJitter));
  const target = normalizeDegrees(-index * SECTOR_DEGREES + clampedJitter);
  const delta = normalizeDegrees(target - normalizeDegrees(currentRotation));
  return currentRotation + Math.max(1, Math.floor(turns)) * FULL_TURN + delta;
}

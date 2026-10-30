import test from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE, sanitizeDraws, getCandidates, chooseCandidate, commitDraw, angleForWinner } from '../draw-model.mjs';

test('eight normal rounds select everyone exactly once', () => {
  let draws = [];
  for (let round = 0; round < PEOPLE.length; round++) {
    const winner = chooseCandidate(draws, { randomIndex: count => count - 1 });
    assert.ok(winner);
    assert.ok(!draws.includes(winner.id));
    const previous = draws;
    draws = commitDraw(draws, winner.id);
    assert.equal(previous.length, round);
    assert.equal(draws.length, round + 1);
    assert.equal(getCandidates(draws).length, PEOPLE.length - round - 1);
  }
  assert.deepEqual(new Set(draws), new Set(PEOPLE.map(person => person.id)));
  assert.equal(chooseCandidate(draws), null);
});

test('reroll replaces only the last round and restores its former winner', () => {
  const initial = PEOPLE.slice(0, 3).map(person => person.id);
  const previousWinner = initial.at(-1);
  const replacement = chooseCandidate(initial, { reroll: true, randomIndex: () => 0 });
  assert.notEqual(replacement.id, previousWinner);
  const rerolled = commitDraw(initial, replacement.id, { reroll: true });
  assert.deepEqual(rerolled.slice(0, -1), initial.slice(0, -1));
  assert.equal(rerolled.length, initial.length);
  assert.equal(rerolled.at(-1), replacement.id);
  assert.equal(initial.at(-1), previousWinner);
  assert.ok(getCandidates(rerolled).some(person => person.id === previousWinner));
  assert.ok(!getCandidates(rerolled).some(person => person.id === replacement.id));
  const again = chooseCandidate(rerolled, { reroll: true, randomIndex: () => 0 });
  assert.notEqual(again.id, replacement.id);
});

test('exhausted pools, missing rounds, and invalid inputs cannot create results', () => {
  const complete = PEOPLE.map(person => person.id);
  assert.equal(chooseCandidate(complete, { reroll: true }), null);
  assert.equal(chooseCandidate([], { reroll: true }), null);
  assert.throws(() => commitDraw([], complete[0], { reroll: true }));
  assert.throws(() => commitDraw(complete, complete[0], { reroll: true }));
  assert.throws(() => commitDraw([], 'Dylan'));
  assert.throws(() => commitDraw([complete[0]], complete[0]));
  assert.throws(() => commitDraw([complete[0], complete[0]], complete[1]));
  assert.throws(() => commitDraw(null, complete[0]));
  assert.throws(() => chooseCandidate([], { randomIndex: () => -1 }));
  assert.throws(() => chooseCandidate([], { randomIndex: count => count }));
  assert.throws(() => chooseCandidate([], { randomIndex: () => 0.5 }));
});

test('persisted histories are sanitized without changing valid order', () => {
  const ids = PEOPLE.map(person => person.id);
  const corrupt = [null, 'Dylan', ids[3], ids[3], 7, ids[0], '', ...ids, ...ids];
  const restored = sanitizeDraws(JSON.parse(JSON.stringify(corrupt)));
  assert.deepEqual(restored, [ids[3], ids[0], ids[1], ids[2], ...ids.slice(4)]);
  assert.equal(restored.length, PEOPLE.length);
  assert.deepEqual(sanitizeDraws(null), []);
  assert.deepEqual(sanitizeDraws({ draws: ids }), []);
  assert.deepEqual(sanitizeDraws([ids[1], ids[0]]), [ids[1], ids[0]]);
  assert.equal(getCandidates(['invalid', ids[0], ids[0]]).length, 7);
});

test('all target angles align the fixed top pointer with the chosen sector', () => {
  const normalize = value => ((value % 360) + 360) % 360;
  for (const current of [-50, 0, 17, 720, 3450.5]) {
    for (let index = 0; index < PEOPLE.length; index++) {
      for (const jitter of [-999, -12, 0, 12, 999]) {
        const rotation = angleForWinner(current, index, jitter);
        assert.ok(rotation > current);
        assert.ok(rotation - current >= 6 * 360);
        const pointerAngle = normalize(-rotation);
        const pointedIndex = Math.round(pointerAngle / 45) % PEOPLE.length;
        assert.equal(pointedIndex, index);
        const distance = Math.abs(normalize(pointerAngle - index * 45 + 180) - 180);
        assert.ok(distance <= 12 + 1e-9);
      }
    }
  }
  assert.ok(angleForWinner(0, 0, 0, 0) > 0);
  assert.throws(() => angleForWinner(NaN, 0));
  assert.throws(() => angleForWinner(0, 8));
});

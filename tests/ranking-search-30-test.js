const assert = require('assert');
const { loadBattleSim } = require('./harness');
const ranking = require('../ranking/beast-priority-search-30');

const app = loadBattleSim();

assert.deepStrictEqual(ranking.validateConfiguration(app), []);
assert.strictEqual(ranking.TARGET_IDS.length, 30);
assert.strictEqual(new Set(ranking.TARGET_IDS).size, 30);
assert.strictEqual(ranking.OPPONENT_POOLS.length, 5);
assert(ranking.OPPONENT_POOLS.every(pool => pool.ids.length === 6));

const opponentIds = ranking.OPPONENT_POOLS.flatMap(pool => pool.ids);
assert.strictEqual(opponentIds.length, 30);
assert.strictEqual(new Set(opponentIds).size, 30);
assert.deepStrictEqual(
  [...opponentIds].sort(),
  [...ranking.TARGET_IDS].sort()
);

const forbiddenIds = new Set([...ranking.EXCLUDED_IDS, ...ranking.DUPLICATE_IDS]);
assert(ranking.TARGET_IDS.every(id => !forbiddenIds.has(id)));
assert(opponentIds.every(id => !forbiddenIds.has(id)));
assert(ranking.TARGET_IDS.every(id => !ranking.EXCLUDED_NAMES.includes(app.CHARS[id].name)));

assert.strictEqual(ranking.STAGES.stage1.candidates, 50000);
assert.strictEqual(ranking.STAGES.stage2.candidates, 30000);
assert.strictEqual(ranking.STAGES.stage3.candidates, 800);
assert.strictEqual(ranking.STAGES.stage4.candidates, 80);
assert.strictEqual(ranking.STAGES.final.candidates, 10);
assert.strictEqual(ranking.STAGES.replacement.candidates, 144);
assert.strictEqual(ranking.PLANNED_BATTLES, 1513200);

for (const stageName of Object.keys(ranking.STAGES)) {
  const first = ranking.stageSchedule(stageName, 0);
  const repeated = ranking.stageSchedule(stageName, 0);
  assert.deepStrictEqual(first, repeated);
  const sequenceA = app.withSeededRandom(
    first.seed,
    () => Array.from({ length: 20 }, () => Math.random())
  );
  const sequenceB = app.withSeededRandom(
    repeated.seed,
    () => Array.from({ length: 20 }, () => Math.random())
  );
  assert.deepStrictEqual(sequenceA, sequenceB);
}

for (let trial = 0; trial < 60; trial++) {
  const schedule = ranking.stageSchedule('stage-test', trial);
  assert.strictEqual(schedule.opponentPoolIndex, trial % 5);
  assert.strictEqual(schedule.candidateOrderPatternIndex, trial % 12);
  assert.strictEqual(
    schedule.opponentOrderPatternIndex,
    Math.floor(trial / 5) % 12
  );
}

const sample = ranking.generateBalancedCombos(3000);
assert.strictEqual(sample.combos.length, 3000);
assert.strictEqual(new Set(sample.combos.map(ranking.comboKey)).size, 3000);
assert(sample.combos.every(ids => ids.length === 6 && new Set(ids).size === 6));
const sampleCounts = Object.values(sample.adoptionCounts);
assert(
  (Math.max(...sampleCounts) - Math.min(...sampleCounts)) /
    (sampleCounts.reduce((sum, value) => sum + value, 0) / sampleCounts.length) <= 0.10,
  'balanced candidate generation must keep adoption counts close'
);

const fakeResults = Array.from({ length: 100 }, (_, index) => ({
  ids: [
    ranking.TARGET_IDS[index % 30],
    ranking.TARGET_IDS[(index + 1) % 30],
    ranking.TARGET_IDS[(index + 2) % 30],
    ranking.TARGET_IDS[(index + 3) % 30],
    ranking.TARGET_IDS[(index + 4) % 30],
    ranking.TARGET_IDS[(index + 5) % 30],
  ],
  winRate: 1 - index / 200,
  avgAlive: 1,
  avgHp: 100,
}));
const beastRanking = ranking.buildBeastRanking(
  app,
  fakeResults.slice(0, 20),
  fakeResults.slice(0, 80),
  fakeResults
);
assert.strictEqual(beastRanking.length, 30);
assert(beastRanking.every((item, index) => item.rank === index + 1));
assert(beastRanking.every(item =>
  Number.isInteger(item.top20AdoptionCount) &&
  Number.isInteger(item.top50AdoptionCount) &&
  Number.isInteger(item.top100AdoptionCount)
));
assert(beastRanking.every(item =>
  item.score ===
    item.top50AdoptionRate * 0.45 +
    item.top20AdoptionRate * 0.45 +
    item.top100AdoptionRate * 0.10
));
assert(ranking.buildCombinationSynergy(app, fakeResults, 2).length > 0);
assert(ranking.buildCombinationSynergy(app, fakeResults, 3).length > 0);

{
  const counters = ranking.createCounters();
  let attempts = 0;
  let teamFactoryCalls = 0;
  const fakeApp = {
    withSeededRandom(seed, callback) {
      assert.strictEqual(seed, 123);
      return callback();
    },
    simulateBattle6v6() {
      attempts++;
      if (attempts === 1) throw new Error('transient test failure');
      return { winningTeam: 'A' };
    },
  };
  const result = ranking.runBattleWithCounters(
    fakeApp,
    () => {
      teamFactoryCalls++;
      return { teamA: [], teamB: [] };
    },
    123,
    counters
  );
  assert.strictEqual(result.winningTeam, 'A');
  assert.strictEqual(teamFactoryCalls, 2, 'every retry must receive fresh team objects');
  assert.strictEqual(counters.startedBattles, 2);
  assert.strictEqual(counters.completedBattles, 1);
  assert.strictEqual(counters.errorBattles, 1);
  assert.strictEqual(counters.retries, 1);
}

{
  const counters = ranking.createCounters();
  const fakeApp = {
    withSeededRandom(seed, callback) {
      assert.strictEqual(seed, 456);
      return callback();
    },
    simulateBattle6v6() {
      throw new Error('persistent test failure');
    },
  };
  assert.throws(
    () => ranking.runBattleWithCounters(
      fakeApp,
      () => ({ teamA: [], teamB: [] }),
      456,
      counters,
      { stage: 'stage1', candidateKey: 'a|b|c', trial: 7 }
    ),
    error => {
      assert.strictEqual(error.rankingContext.stage, 'stage1');
      assert.strictEqual(error.rankingContext.candidateKey, 'a|b|c');
      assert.strictEqual(error.rankingContext.trial, 7);
      assert.strictEqual(error.rankingContext.seed, 456);
      assert.strictEqual(error.rankingContext.error.message, 'persistent test failure');
      return true;
    }
  );
  assert.strictEqual(counters.startedBattles, 4);
  assert.strictEqual(counters.completedBattles, 0);
  assert.strictEqual(counters.errorBattles, 4);
  assert.strictEqual(counters.retries, 3);
}

console.log('ranking search 30 ok');

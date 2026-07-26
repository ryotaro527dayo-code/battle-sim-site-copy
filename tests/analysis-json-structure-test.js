const assert = require('assert');
const { loadBattleSim, beast } = require('./harness');

const app = loadBattleSim();

function teams() {
  const attacker = beast('analysis_attacker', 'Analysis Attacker', { agi: 210, atk: 170, will: 250, dur: 500 }, [
    { name: '攻撃-連撃', type: 'attack', rageCost: 0, effect: 'combo', param: 0.80 },
    { name: '防御-硬化皮膚', type: 'defense', rageCost: 0, effect: 'harden', param: 0.25 },
  ]);
  const defender = beast('analysis_defender', 'Analysis Defender', { agi: 180, atk: 80, will: 260, dur: 420 }, [
    { name: '防御-硬化皮膚', type: 'defense', rageCost: 0, effect: 'harden', param: 0.30 },
    { name: '反撃', type: 'defense', rageCost: 0, effect: 'counter', param: 0.25 },
  ]);
  const benchA = beast('analysis_bench_a', 'Analysis Bench A', { agi: 150, atk: 70, will: 200, dur: 300 }, []);
  const benchB = beast('analysis_bench_b', 'Analysis Bench B', { agi: 150, atk: 70, will: 200, dur: 300 }, []);
  return { attacker, defender, benchA, benchB };
}

const first = teams();
const result = app.withSeededRandom(24681357, () =>
  app.simulateBattle6v6([first.attacker, first.benchA], [first.defender, first.benchB], true, { analysisMode: 'developer' })
);

const events = result.analysisEvents || [];
const hit = events.find(event =>
  event.eventType === 'hit' &&
  event.hitType === 'main' &&
  event.debugCalculation?.damage?.finalDamage != null &&
  event.debugCalculation?.hpCalculation &&
  event.debugCalculation?.attackSkillCheck?.checks &&
  event.debugCalculation?.defenseSkillCheck?.checks
);

assert(hit, 'developer analysis JSON must include at least one hit event with damage and hpCalculation');

const debug = hit.debugCalculation;
assert(Array.isArray(debug.damage.damageBonusBreakdown), 'damageBonusBreakdown must exist on debugCalculation.damage');
assert(Array.isArray(debug.damage.defenseMultiplierBreakdown), 'defenseMultiplierBreakdown must exist on debugCalculation.damage');
assert(debug.damage.skillCalculation && typeof debug.damage.skillCalculation === 'object', 'skillCalculation must exist on debugCalculation.damage');
assert(debug.hpCalculation && Array.isArray(debug.hpCalculation.steps), 'hpCalculation.steps must exist');
assert(debug.maxHpCalculation && typeof debug.maxHpCalculation === 'object', 'maxHpCalculation must exist');
assert(debug.attackSkillCheck && Array.isArray(debug.attackSkillCheck.checks), 'attackSkillCheck.checks must exist');
assert(debug.defenseSkillCheck && Array.isArray(debug.defenseSkillCheck.checks), 'defenseSkillCheck.checks must exist');
assert(debug.damage.rng && typeof debug.damage.rng.sequenceIndex === 'number', 'rng.sequenceIndex must exist');
assert(debug.damage.rng.purpose, 'rng.purpose must exist');
assert.strictEqual(hit.debugFullSnapshot, false, 'debugFullSnapshot must exist on events and default to false');
assert(!hit.stateBefore.teams, 'full team snapshots should be omitted by default');
assert(
  events.every(event => !event.stateBefore || !Object.prototype.hasOwnProperty.call(event.stateBefore, 'teams')),
  'stateBefore.teams must be omitted from every event by default'
);

const stepLabels = debug.damage.steps.map(step => step.label);
[
  'base_attack',
  'random_multiplier',
  'rounding',
  'target_multiplier_base',
  'damage_bonus_multiplier',
  'defense_multiplier',
].forEach(label => assert(stepLabels.includes(label), `damage.steps must include ${label}`));
assert(debug.damage.steps.length >= 7, 'damage.steps must be detailed, not the old two-step summary');
assert(
  !stepLabels.includes('skill_multiplier'),
  'default main-hit damage must not invent a skill multiplier operation that the code did not execute'
);
assert.strictEqual(
  stepLabels.includes('damage_bonus_adjustment'),
  debug.damage.damageBonusBreakdown.length > 1,
  'damage bonus adjustment steps must exist exactly when a damage bonus branch ran'
);
assert.strictEqual(
  stepLabels.includes('defense_multiplier_adjustment'),
  debug.damage.defenseMultiplierBreakdown.length > 1,
  'defense multiplier adjustment steps must exist exactly when a defense branch ran'
);

const orderedSteps = debug.damage.steps;
orderedSteps.forEach((step, index) => {
  assert.strictEqual(step.order, index + 1, 'damage.steps order must be contiguous and match array order');
});
const roundingSteps = orderedSteps.filter(step => step.label === 'rounding');
const firstRoundingStep = roundingSteps.find(step => step.inputs?.stage === 'initial_damage');
const targetApplicationStep = orderedSteps.find(step => step.label === 'defense_multiplier');
const finalRoundingStep = roundingSteps.find(step => step.inputs?.stage === 'final_damage');
assert.strictEqual(firstRoundingStep.after, Math.round(firstRoundingStep.before), 'first rounding step must match Math.round');
assert.strictEqual(
  targetApplicationStep.after,
  targetApplicationStep.before * targetApplicationStep.multiplier,
  'target multiplier application must reproduce the unrounded final damage'
);
assert.strictEqual(finalRoundingStep.after, Math.round(finalRoundingStep.before), 'final rounding step must match Math.round');
assert.strictEqual(finalRoundingStep.after, debug.damage.finalDamage, 'damage.steps must end at the recorded final damage');

const fullPowerAttacker = beast('analysis_full_power', 'Analysis Full Power', { agi: 210, atk: 170, will: 250, dur: 500 }, [
  { name: '攻撃-全力', type: 'attack', rageCost: 0, effect: 'full_power', param: 2.30 },
]);
const fullPowerDefender = beast('analysis_full_power_target', 'Analysis Full Power Target', { agi: 180, atk: 80, will: 260, dur: 1000 }, []);
const fullPowerResult = app.withSeededRandom(13579, () =>
  app.simulateBattle6v6([fullPowerAttacker], [fullPowerDefender], true, { analysisMode: 'developer' })
);
const fullPowerHit = (fullPowerResult.analysisEvents || []).find(event =>
  event.eventType === 'hit' && event.hitType === 'main' && event.skillId === 'full_power'
);
assert(fullPowerHit, 'full power hit must be present for calculation-order verification');
const fullPowerSteps = fullPowerHit.debugCalculation.damage.steps;
assert.deepStrictEqual(
  fullPowerSteps.slice(0, 4).map(step => step.label),
  ['base_attack', 'skill_multiplier', 'random_multiplier', 'rounding'],
  'full power steps must preserve the code order: skill multiplier, random multiplier, then first rounding'
);
assert.strictEqual(
  fullPowerSteps[2].after,
  fullPowerSteps[1].after * fullPowerSteps[2].multiplier,
  'full power random step must continue from the skill-multiplied value'
);
[
  'base_attack',
  'random_multiplier',
  'skill_multiplier',
  'damage_bonus_multiplier',
  'defense_multiplier',
  'rounding',
].forEach(label => {
  assert(
    fullPowerSteps.some(step => step.label === label),
    `generated full-power JSON must contain the requested ${label} step`
  );
});

const second = teams();
const resultWithSnapshots = app.withSeededRandom(24681357, () =>
  app.simulateBattle6v6([second.attacker, second.benchA], [second.defender, second.benchB], true, {
    analysisMode: 'developer',
    debugFullSnapshot: true,
  })
);
const snapshotHit = (resultWithSnapshots.analysisEvents || []).find(event => event.eventType === 'hit');
assert(snapshotHit?.stateBefore?.teams, 'full team snapshots should be included when debugFullSnapshot is true');
assert.strictEqual(snapshotHit.debugFullSnapshot, true, 'debugFullSnapshot must be true when full snapshots are enabled');

const legacyAliasTeams = teams();
const resultWithLegacyAlias = app.withSeededRandom(24681357, () =>
  app.simulateBattle6v6(
    [legacyAliasTeams.attacker, legacyAliasTeams.benchA],
    [legacyAliasTeams.defender, legacyAliasTeams.benchB],
    true,
    { analysisMode: 'developer', includeTeamSnapshots: true }
  )
);
assert.strictEqual(resultWithLegacyAlias.debugFullSnapshot, false, 'only debugFullSnapshot may enable full snapshots');
assert(
  (resultWithLegacyAlias.analysisEvents || []).every(event =>
    !event.stateBefore || !Object.prototype.hasOwnProperty.call(event.stateBefore, 'teams')
  ),
  'includeTeamSnapshots must not emit stateBefore.teams'
);

console.log('analysis json structure ok');

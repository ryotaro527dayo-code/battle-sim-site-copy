const assert = require('assert');
const { loadBattleSim, beast } = require('./harness');

const app = loadBattleSim();

function runWithCount(seed, mode) {
  const originalRandom = Math.random;
  let count = 0;
  const seeded = (() => {
    let x = seed >>> 0;
    return function() {
      x = (x + 0x6D2B79F5) >>> 0;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  Math.random = () => {
    count++;
    return seeded();
  };
  try {
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
    const result = app.simulateBattle6v6([attacker, benchA], [defender, benchB], true, { analysisMode: mode });
    return {
      count,
      winningTeam: result.winningTeam,
      hpA: result.teamA.map(f => f.hp),
      hpB: result.teamB.map(f => f.hp),
      logText: result.log.map(row => row.msg).join('\n'),
      events: result.analysisEvents || [],
    };
  } finally {
    Math.random = originalRandom;
  }
}

function refOf(ref) {
  if (!ref) return null;
  return {
    team: ref.team,
    index: ref.index,
    beastId: ref.beastId,
  };
}

function hpOf(state) {
  if (!state) return null;
  return {
    actorHp: state.actor?.hp,
    targetHp: state.target?.hp,
  };
}

function statusOf(state) {
  if (!state) return null;
  return {
    actor: state.actor?.statuses,
    target: state.target?.statuses,
    actorPoisonStacks: state.actor?.poisonStacks,
    targetPoisonStacks: state.target?.poisonStacks,
  };
}

function normalizeEvents(events) {
  return events.map(event => ({
    actionNo: event.actionNo,
    matchupNo: event.matchupNo,
    eventType: event.eventType,
    actor: refOf(event.actor),
    target: refOf(event.target),
    attackType: event.attackType,
    skillId: event.skillId,
    hitIndex: event.hitIndex,
    hitType: event.hitType,
    damageDisplayed: event.damage?.displayed,
    stateBeforeHp: hpOf(event.stateBefore),
    stateAfterHp: hpOf(event.stateAfter),
    stateBeforeStatus: statusOf(event.stateBefore),
    stateAfterStatus: statusOf(event.stateAfter),
    lethal: event.damage?.lethal,
    defeated: refOf(event.defeated),
    nextFighter: refOf(event.nextFighter),
    carryover: event.carryover,
    carryoverEntryEffectsApplied: event.carryoverEntryEffectsApplied,
    effectsApplied: event.effectsApplied,
    defenseTriggered: event.defense?.triggered,
    defenseSkillId: event.defense?.skillId,
    dodgeChecked: event.dodge?.checked,
    dodgeSuccess: event.dodge?.success,
  }));
}

const normal = runWithCount(123456, 'normal');
const detail = runWithCount(123456, 'detail');
const developer = runWithCount(123456, 'developer');

for (const result of [detail, developer]) {
  assert.strictEqual(result.winningTeam, normal.winningTeam, 'analysis mode must not change the winner');
  assert.deepStrictEqual(result.hpA, normal.hpA, 'analysis mode must not change team A HP results');
  assert.deepStrictEqual(result.hpB, normal.hpB, 'analysis mode must not change team B HP results');
  assert.strictEqual(result.logText, normal.logText, 'analysis mode must not change the human battle log');
  assert.strictEqual(result.count, normal.count, 'analysis mode must not add or remove random calls');
  assert(result.events.some(e => e.eventType === 'hit' && e.hitIndex === 2), 'combo second hit should be a separate event');
  assert(result.events.some(e => e.defense && Object.prototype.hasOwnProperty.call(e.defense, 'triggered')), 'defense decision should be recorded');
  assert(result.events.some(e => e.damage && typeof e.damage.displayed === 'number'), 'damage should be recorded');
  const calculatedHit = result.events.find(e => e.eventType === 'hit' && e.damage && e.debugCalculation);
  assert(calculatedHit, 'hit events should include structured debugCalculation data');
  assert.strictEqual(typeof calculatedHit.debugCalculation.damage.finalDamage, 'number', 'debugCalculation should record final damage');
  assert.strictEqual(typeof calculatedHit.debugCalculation.hp.hpBefore, 'number', 'debugCalculation should record HP before damage');
  assert(calculatedHit.debugCalculation.rage, 'debugCalculation should record rage calculation context');
}

assert.deepStrictEqual(
  normalizeEvents(developer.events),
  normalizeEvents(detail.events),
  'detail and developer modes must produce the same common battle event sequence'
);

assert.strictEqual((normal.events || []).length, 0, 'normal mode should not emit analysis events');
assert(developer.events.some(e => e.damage && e.damage.randoms), 'developer mode should include recorded random values');

{
  const silent = app.withSeededRandom(999, () => app.simulateBattle6v6([
    beast('silent_a', 'Silent A', { agi: 100, atk: 50, will: 100 }, []),
  ], [
    beast('silent_b', 'Silent B', { agi: 90, atk: 40, will: 100 }, []),
  ], false));
  assert.strictEqual(silent.log.length, 0, 'verbose=false should keep the human log disabled');
  assert.strictEqual(silent.analysisEvents.length, 0, 'verbose=false without analysis options should not emit analysis events');
}

console.log('analysis mode ok');

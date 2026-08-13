const assert = require('assert');
const { loadBattleSim, beast } = require('./harness');

const app = loadBattleSim();

function runDodgeBattle(seed, withDodge = true) {
  const attacker = beast('dodge_attack_user', 'Dodge Attack User', {
    agi: 200,
    atk: 10,
    dur: 5000,
    will: 187,
  }, [
    { name: '攻撃-全力一撃', type: 'attack', rageCost: 50, effect: 'full_power', param: 2.30 },
  ]);
  const defenderSkills = withDodge ? [
    { name: '防御-回避', type: 'defense', rageCost: 0, effect: 'def_dodge', param: 0.60 },
  ] : [];
  const defender = beast('dodge_attack_target', 'Dodge Attack Target', {
    agi: 100,
    atk: 1,
    dur: 5000,
    will: 66,
  }, defenderSkills);

  return app.withSeededRandom(seed, () =>
    app.simulateBattle6v6([attacker], [defender], true, { analysisMode: 'developer' })
  );
}

function attackerHits(result) {
  return result.analysisEvents.filter(event =>
    event.eventType === 'hit' &&
    event.hitType === 'main' &&
    event.actor?.beastId === 'dodge_attack_user' &&
    event.target?.beastId === 'dodge_attack_target'
  );
}

function assertDodgeFields(event) {
  const dodge = event.dodge;
  for (const key of [
    'dodgeEligible',
    'dodgeRoll',
    'dodgeSuccess',
    'attackSkillAvailableBeforeDodge',
    'forcedNormalByDodgeSuccess',
    'attackTypeAfterDodgeCheck',
    'attackRageBefore',
    'attackRageAfter',
    'dodgeConsumed',
  ]) {
    assert(Object.hasOwn(dodge, key), `dodge analysis must include ${key}`);
  }
}

{
  const hits = attackerHits(runDodgeBattle(2));
  const event = hits.find(hit =>
    hit.stateBefore.actor.attackRage >= 50 && hit.dodge?.success === true
  );
  assert(event, 'case 1: a successful dodge with attack skill rage must occur');
  assertDodgeFields(event);
  assert.strictEqual(event.attackType, 'normal');
  assert.strictEqual(event.skillId, null);
  assert.strictEqual(event.damage.displayed, 0);
  assert.strictEqual(event.dodge.attackSkillAvailableBeforeDodge, true);
  assert.strictEqual(event.dodge.forcedNormalByDodgeSuccess, true);
  assert.strictEqual(event.dodge.attackTypeAfterDodgeCheck, 'normal');
  assert.strictEqual(event.dodge.attackRageAfter, event.dodge.attackRageBefore);
  assert.strictEqual(event.dodge.dodgeConsumed, true);
  assert.strictEqual(event.attackSkill.reason, 'dodge_success_forces_normal');
}

{
  const hits = attackerHits(runDodgeBattle(1));
  const event = hits.find(hit =>
    hit.stateBefore.actor.attackRage >= 50 && hit.dodge?.checked && hit.dodge.success === false
  );
  assert(event, 'case 2: a failed dodge with attack skill rage must occur');
  assertDodgeFields(event);
  assert.strictEqual(event.attackType, 'skill');
  assert.strictEqual(event.skillId, 'full_power');
  assert(event.damage.displayed > 0);
  assert.strictEqual(event.dodge.attackSkillAvailableBeforeDodge, true);
  assert.strictEqual(event.dodge.forcedNormalByDodgeSuccess, false);
  assert.strictEqual(event.dodge.attackTypeAfterDodgeCheck, 'skill');
  assert.strictEqual(event.dodge.attackRageAfter, event.dodge.attackRageBefore - 50);
  assert.strictEqual(event.dodge.dodgeConsumed, true);
}

{
  const event = attackerHits(runDodgeBattle(6))[0];
  assert(event, 'case 3: first low-rage attack must occur');
  assert.strictEqual(event.stateBefore.actor.attackRage, 0);
  assert.strictEqual(event.dodge.success, true);
  assert.strictEqual(event.attackType, 'normal');
  assert.strictEqual(event.damage.displayed, 0);
  assert.strictEqual(event.dodge.attackSkillAvailableBeforeDodge, false);
}

{
  const event = attackerHits(runDodgeBattle(1))[0];
  assert(event, 'case 4: first low-rage attack must occur');
  assert.strictEqual(event.stateBefore.actor.attackRage, 0);
  assert.strictEqual(event.dodge.success, false);
  assert.strictEqual(event.attackType, 'normal');
  assert(event.damage.displayed > 0);
  assert.strictEqual(event.stateAfter.actor.attackRage, 50);
}

{
  const hits = attackerHits(runDodgeBattle(1, false));
  const event = hits.find(hit => hit.stateBefore.actor.attackRage >= 50);
  assert(event, 'case 5: attack skill opportunity without dodge must occur');
  assert.strictEqual(event.dodge.dodgeEligible, false);
  assert.strictEqual(event.attackType, 'skill');
  assert.strictEqual(event.skillId, 'full_power');
  assert(event.damage.displayed > 0);
}

console.log('dodge attack selection ok');

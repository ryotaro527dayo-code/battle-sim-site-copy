const assert = require('assert');
const { loadBattleSim, beast } = require('./harness');

const app = loadBattleSim();

{
  const attacker = beast('test_counter_killer', 'Counter Killer', { agi: 200, atk: 100, dur: 100, will: 67 }, []);
  const defender = beast('test_counter_dead', 'Counter Dead', { agi: 100, atk: 400, dur: 10, will: 66 }, [
    { name: '防御-反撃', type: 'defense', rageCost: 0, effect: 'counter', param: 0.25 },
  ]);

  const result = app.simulateBattle6v6([attacker], [defender], true);
  const logText = result.log.map(row => row.msg).join('\n');

  assert.strictEqual(result.teamB[0].hp, 0, 'defender should be defeated by the incoming hit');
  assert.strictEqual(result.teamA[0].hp, 300, 'reserved counter should still damage the attacker after lethal hit');
  assert(logText.includes('反撃'), 'lethal hit should still produce a counter log');
}

{
  const comboUser = beast('test_combo_single_defense', 'Combo Single Defense', { agi: 200, atk: 100, dur: 1000, will: 67 }, [
    { name: '攻撃-連撃', type: 'attack', rageCost: 0, effect: 'combo', param: 0.80 },
  ]);
  const counterTarget = beast('test_combo_counter_target', 'Combo Counter Target', { agi: 100, atk: 100, dur: 40, will: 66 }, [
    { name: '防御-反撃', type: 'defense', rageCost: 0, effect: 'counter', param: 0.25 },
  ]);

  const result = app.simulateBattle6v6([comboUser], [counterTarget], true);
  const logText = result.log.map(row => row.msg).join('\n');
  const counterUses = (logText.match(/が【防御-反撃】を発動/g) || []).length;
  const counterHits = (logText.match(/の反撃！/g) || []).length;

  assert.strictEqual(counterUses, 1, 'combo should check defense rage skill only on the first hit');
  assert.strictEqual(counterHits, 1, 'combo second hit must not trigger a second counter');
}

{
  assert.strictEqual(app.SKILL_SEAL_BLOCKS_DEFENSE_SKILLS, true, 'skill seal must block every defense skill');

  const cases = [
    { effect: 'counter', name: '防御-反撃', param: 0.25, readyStatus: 'counterReady' },
    { effect: 'harden', name: '防御-硬化皮膚', param: 0.35, readyStatus: 'hardenReady' },
    { effect: 'def_dodge', name: '防御-回避', param: 0.60, readyStatus: 'defDodgeReady' },
  ];

  for (const defenseCase of cases) {
    const weakUser = beast(`test_seal_user_${defenseCase.effect}`, `Seal User ${defenseCase.effect}`, {
      agi: 200, atk: 10, dur: 2000, will: 67,
    }, [
      { name: '攻撃-虚弱', type: 'attack', rageCost: 20, effect: 'weak', param: 0.25, param2: 2 },
    ]);
    const sealedDefender = beast(`test_sealed_${defenseCase.effect}`, `Sealed ${defenseCase.effect}`, {
      agi: 100, atk: 1, dur: 2000, will: 66,
    }, [
      { name: defenseCase.name, type: 'defense', rageCost: 30, effect: defenseCase.effect, param: defenseCase.param },
    ]);

    const result = app.withSeededRandom(777, () =>
      app.simulateBattle6v6([weakUser], [sealedDefender], true, { analysisMode: 'developer' })
    );
    const targetId = sealedDefender.id;
    const targetHits = result.analysisEvents.filter(event =>
      event.eventType === 'hit' &&
      event.hitType === 'main' &&
      event.target?.beastId === targetId
    );
    const sealedHit = targetHits.find(event =>
      event.stateBefore?.target?.statuses?.skillSealTurns > 0 &&
      event.defense?.reason === 'sealed'
    );

    assert(sealedHit, `${defenseCase.effect}: sealed defense skip must be logged`);
    assert.strictEqual(sealedHit.defense.triggered, false, `${defenseCase.effect}: sealed defense skill must not trigger`);
    assert.strictEqual(
      sealedHit.defense.rageAfter,
      sealedHit.defense.rageBefore,
      `${defenseCase.effect}: sealed defense skill must preserve defense rage`
    );
    assert.strictEqual(
      sealedHit.stateAfter.target.statuses[defenseCase.readyStatus],
      false,
      `${defenseCase.effect}: sealed defense effect must not be reserved`
    );
    const sealCheck = sealedHit.defense.check.checks.find(check => check.condition === 'not_sealed');
    assert(sealCheck && sealCheck.passed === false, `${defenseCase.effect}: defense check must record sealed`);

    const postSealTrigger = targetHits.find(event =>
      event.actionNo > sealedHit.actionNo &&
      event.stateBefore?.target?.statuses?.skillSealTurns === 0 &&
      event.defense?.triggered === true &&
      event.defense?.skillId === defenseCase.effect
    );
    assert(postSealTrigger, `${defenseCase.effect}: defense skill must trigger at the next eligible opportunity after seal expires`);
    assert.strictEqual(
      postSealTrigger.defense.rageAfterConsume,
      postSealTrigger.defense.rageBefore - 30,
      `${defenseCase.effect}: rage must be consumed only after the seal expires`
    );
  }
}

{
  const weakUser = beast('test_weak_user', 'Weak User', { agi: 200, atk: 1 }, [
    { name: '攻撃-虚弱', type: 'attack', rageCost: 0, effect: 'weak', param: 0.25, param2: 2 },
  ]);
  const comboUser = beast('test_combo_user', 'Combo User', { agi: 100, atk: 1 }, [
    { name: '攻撃-連撃', type: 'attack', rageCost: 0, effect: 'combo', param: 0.80 },
  ]);

  const result = app.simulateBattle6v6([weakUser], [comboUser], true);
  const messages = result.log.map(row => row.msg);
  const firstSeal = messages.findIndex(msg => msg.includes('スキル封印中'));

  assert(firstSeal >= 0, 'weakness should seal the target attack skill');
  assert(messages[firstSeal].includes('test_combo_user'), `sealed skill should apply to the weakness target: ${messages[firstSeal]}`);
  assert(
    messages.some(msg => msg.includes('スキル封印2行動')),
    'weakness should apply a two-combined-action skill seal'
  );
}

{
  assert.strictEqual(app.ENABLE_QUAKE_HARDEN_LINK_BUG, false, 'quake harden hidden reservation bug must stay disabled');

  const quakeUser = beast('test_quake_user', 'Quake User', { agi: 200, atk: 100, will: 999 }, [
    { name: '攻撃-大地震撼', type: 'attack', rageCost: 0, effect: 'quake', param: 1.50, param2: 0.20 },
    { name: '防御-硬化皮膚', type: 'defense', rageCost: 0, effect: 'harden', param: 0.35 },
  ]);
  const hardenTarget = beast('test_harden_target', 'Harden Target', { agi: 100, atk: 1, will: 999 }, [
    { name: '防御-硬化皮膚', type: 'defense', rageCost: 0, effect: 'harden', param: 0.35 },
  ]);

  const result = app.simulateBattle6v6([quakeUser], [hardenTarget], true);
  const logText = result.log.map(row => row.msg).join('\n');

  assert(logText.includes('大地震撼'), 'quake should execute');
  assert(logText.includes('硬化皮膚'), 'defender harden should reduce quake');
  assert(!logText.includes('quake_harden_link'), 'hidden harden reservation marker must never appear');
  assert.strictEqual(result.teamA[0].hardenSource, null, 'quake user must not receive hidden harden reservation');
}

{
  const uniqueOcrIds = app.getUniqueOcrCharIds();
  for (const id of ['dacentrurus', 'thunder_bull', 'azure_stego', 'silver_frost_rex']) {
    assert(uniqueOcrIds.includes(id), `${id} should appear in OCR options`);
  }
  const options = app.buildOcrCharOptions('dacentrurus');
  assert(options.includes('value="dacentrurus" selected'), 'selected OCR beast should be marked selected');
  assert.strictEqual(new Set(uniqueOcrIds).size, uniqueOcrIds.length, 'OCR options should not contain duplicate ids');
}

console.log('battle rules ok');

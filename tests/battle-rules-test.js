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
  assert.strictEqual(app.SEAL_BLOCKS_DEFENSE_RAGE_SKILLS, true, 'provisional seal defense block should be isolated behind a flag');

  const weakUser = beast('test_seal_blocks_defense_user', 'Seal Blocks Defense User', { agi: 200, atk: 1000, dur: 1000, will: 67 }, [
    { name: '攻撃-虚弱', type: 'attack', rageCost: 0, effect: 'weak', param: 0.25, param2: 2 },
  ]);
  const sealedCounter = beast('test_sealed_counter_target', 'Sealed Counter Target', { agi: 100, atk: 1, dur: 450, will: 66 }, [
    { name: '防御-反撃', type: 'defense', rageCost: 0, effect: 'counter', param: 0.25 },
  ]);

  const result = app.simulateBattle6v6([weakUser], [sealedCounter], true);
  const logText = result.log.map(row => row.msg).join('\n');
  const counterUses = (logText.match(/が【防御-反撃】を発動/g) || []).length;

  assert.strictEqual(counterUses, 1, 'sealed defender should not activate defense rage skill while provisional rule is enabled');
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

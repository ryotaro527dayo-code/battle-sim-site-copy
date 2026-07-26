const assert = require('assert');
const { loadBattleSim, beast } = require('./harness');

const app = loadBattleSim();

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

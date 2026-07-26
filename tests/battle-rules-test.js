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
  const slowUser = beast('test_slow_progress_user', 'Slow Progress User', {
    agi: 200, atk: 1, dur: 1000, will: 1,
  }, [
    { name: '攻撃-減速', type: 'attack', rageCost: 0, effect: 'slow', param: 0.50 },
  ]);
  const slowTarget = beast('test_slow_progress_target', 'Slow Progress Target', {
    agi: 150, atk: 1, dur: 1000, will: 1,
  }, []);

  const result = app.withSeededRandom(321, () =>
    app.simulateBattle6v6([slowUser], [slowTarget], true, { analysisMode: 'developer' })
  );
  const actions = result.analysisEvents.filter(event => event.eventType === 'action_start');
  const slowStatus = result.analysisEvents.find(event =>
    event.eventType === 'status' &&
    event.skillId === 'slow' &&
    event.target?.beastId === slowTarget.id
  );

  assert.strictEqual(actions[0].actor.beastId, slowUser.id, 'faster slow user should act first');
  assert.strictEqual(
    actions[1].actor.beastId,
    slowTarget.id,
    'slow target must keep its accumulated action progress and act next'
  );
  assert(slowStatus, 'slow application must produce an analysis status event');
  const progress = slowStatus.debugCalculation.status;
  assert.strictEqual(progress.oldEffectiveAgi, 150, 'slow log must record effective AGI before application');
  assert.strictEqual(progress.newEffectiveAgi, 150, 'attack-skill slow must not change action-gauge AGI by default');
  assert.strictEqual(progress.agiAfter, 75, 'attack-skill slow must still change display AGI');
  assert.strictEqual(progress.actionGauge, 750, 'slow must preserve the action gauge accumulated before application');
  assert.strictEqual(progress.actionProgressPreserved, true, 'slow log must mark action progress as preserved');
  assert(Math.abs(progress.oldInterval - (1000 / 150)) < 1e-12, 'slow log must record the old interval');
  assert(Math.abs(progress.oldRemainingTime - (250 / 150)) < 1e-12, 'slow log must record old remaining time');
  assert(Math.abs(progress.progressRatio - 0.75) < 1e-12, 'slow log must record the preserved progress ratio');
  assert(Math.abs(progress.newInterval - (1000 / 150)) < 1e-12, 'default action-gauge interval must exclude attack-skill slow');
  assert(Math.abs(progress.newRemainingTime - (250 / 150)) < 1e-12, 'remaining time must preserve progress at unchanged action-gauge AGI');
}

{
  const firstAttacker = beast('test_progress_reset_first', 'Progress Reset First', {
    agi: 200, atk: 1, dur: 10, will: 1,
  }, []);
  const replacement = beast('test_progress_reset_replacement', 'Progress Reset Replacement', {
    agi: 150, atk: 1, dur: 1000, will: 1,
  }, []);
  const counterSurvivor = beast('test_progress_reset_survivor', 'Progress Reset Survivor', {
    agi: 100, atk: 400, dur: 1000, will: 1,
  }, [
    { name: '防御-反撃', type: 'defense', rageCost: 0, effect: 'counter', param: 0.25 },
  ]);

  const result = app.withSeededRandom(654, () =>
    app.simulateBattle6v6([firstAttacker, replacement], [counterSurvivor], true, { analysisMode: 'detail' })
  );
  const actions = result.analysisEvents.filter(event => event.eventType === 'action_start');

  assert.strictEqual(actions[0].actor.beastId, firstAttacker.id, 'first attacker should act before the counter survivor');
  assert.strictEqual(result.teamA[0].hp, 0, 'counter must defeat the first attacker');
  assert.strictEqual(
    actions[1].actor.beastId,
    replacement.id,
    'death and entry must reset both action gauges instead of preserving the survivor progress'
  );
}

{
  const slowSource = beast('test_slow_source_lifecycle', 'Slow Source Lifecycle', {
    agi: 200, atk: 1, dur: 1000, will: 67,
  }, [
    { name: '攻撃-減速', type: 'attack', rageCost: 40, effect: 'slow', param: 0.50 },
  ]);
  const slowTarget = beast('test_slow_target_lifecycle', 'Slow Target Lifecycle', {
    agi: 150, atk: 1, dur: 1000, will: 1,
  }, []);

  const result = app.withSeededRandom(2468, () =>
    app.simulateBattle6v6([slowSource], [slowTarget], true, { analysisMode: 'developer' })
  );
  const slowApplied = result.analysisEvents.find(event =>
    event.eventType === 'status' &&
    event.skillId === 'slow' &&
    event.target?.beastId === slowTarget.id
  );

  assert(slowApplied, 'slow lifecycle test must apply slow');
  const sourceInstanceId = slowApplied.debugCalculation.status.slowSourceInstanceId;
  const targetInstanceId = slowApplied.debugCalculation.status.slowTargetInstanceId;
  assert.strictEqual(sourceInstanceId, slowApplied.actor.instanceId, 'slow must store the source instance ID');
  assert.strictEqual(targetInstanceId, slowApplied.target.instanceId, 'slow must store the target instance ID');
  assert.deepStrictEqual(slowApplied.debugCalculation.status.attacksUntilRemovalAfter, [2], 'new slow must start at two matching attacks');

  const targetOwnAction = result.analysisEvents.find(event =>
    event.eventType === 'hit' &&
    event.actionNo > slowApplied.actionNo &&
    event.actor?.instanceId === targetInstanceId &&
    event.stateBefore?.actor?.statuses?.slowEffects?.some(effect => effect.attacksUntilRemoval === 2)
  );
  assert(targetOwnAction, 'slowed target must receive an action while slow has two attacks remaining');
  assert.deepStrictEqual(
    targetOwnAction.stateAfter.actor.statuses.slowEffects.map(effect => effect.attacksUntilRemoval),
    [2],
    'slowed target own action must not decrement slow'
  );
  assert.strictEqual(
    targetOwnAction.debugCalculation.slowDecrement.decrementReason,
    'slowed_target_own_action_does_not_decrement',
    'slowed target own action must log why the slow count was preserved'
  );

  const matchingSourceHits = result.analysisEvents.filter(event =>
    event.eventType === 'hit' &&
    event.actionNo > slowApplied.actionNo &&
    event.actor?.instanceId === sourceInstanceId &&
    event.target?.instanceId === targetInstanceId &&
    event.debugCalculation?.slowDecrement?.decrementTriggered
  );
  assert(matchingSourceHits.length >= 2, 'slow source must attack the slow target twice after application');
  assert.deepStrictEqual(
    [
      matchingSourceHits[0].debugCalculation.slowDecrement.attacksUntilRemovalBefore,
      matchingSourceHits[0].debugCalculation.slowDecrement.attacksUntilRemovalAfter,
    ],
    [[2], [1]],
    'first matching source attack must decrement slow from two to one'
  );
  assert.deepStrictEqual(
    [
      matchingSourceHits[1].debugCalculation.slowDecrement.attacksUntilRemovalBefore,
      matchingSourceHits[1].debugCalculation.slowDecrement.attacksUntilRemovalAfter,
    ],
    [[1], [0]],
    'second matching source attack must decrement slow from one to zero'
  );
  assert.deepStrictEqual(
    matchingSourceHits[1].stateAfter.target.statuses.slowEffects,
    [],
    'slow must be removed only when the matching attack count reaches zero'
  );
}

{
  const repeatedSlowSource = beast('test_repeated_slow_source', 'Repeated Slow Source', {
    agi: 200, atk: 1, dur: 1000, will: 1,
  }, [
    { name: '攻撃-減速', type: 'attack', rageCost: 0, effect: 'slow', param: 0.10 },
  ]);
  const sealingTarget = beast('test_repeated_slow_target', 'Repeated Slow Target', {
    agi: 100, atk: 1, dur: 1000, will: 1,
  }, [
    { name: '攻撃-虚弱', type: 'attack', rageCost: 0, effect: 'weak', param: 0.25, param2: 2 },
  ]);

  const result = app.withSeededRandom(9753, () =>
    app.simulateBattle6v6(
      [repeatedSlowSource],
      [sealingTarget],
      true,
      { analysisMode: 'developer', attackSkillSpeedAffectsActionGauge: true }
    )
  );
  const slowApplications = result.analysisEvents.filter(event =>
    event.eventType === 'status' &&
    event.skillId === 'slow' &&
    event.actor?.beastId === repeatedSlowSource.id
  );
  assert(slowApplications.length >= 2, 'source must apply two consecutive independent slow effects');
  assert.deepStrictEqual(
    slowApplications[0].stateAfter.target.statuses.slowEffects.map(effect => effect.attacksUntilRemoval),
    [2],
    'first slow attack must create one effect with count two'
  );
  assert.deepStrictEqual(
    slowApplications[1].stateAfter.target.statuses.slowEffects.map(effect => effect.attacksUntilRemoval),
    [1, 2],
    'second slow attack must decrement the old effect and append a new count-two effect'
  );
  assert.notStrictEqual(
    slowApplications[1].stateAfter.target.statuses.slowEffects[0].id,
    slowApplications[1].stateAfter.target.statuses.slowEffects[1].id,
    'overlapping slow effects must have independent IDs'
  );

  const postSecondApplicationHits = result.analysisEvents.filter(event =>
    event.eventType === 'hit' &&
    event.actionNo > slowApplications[1].actionNo &&
    event.actor?.beastId === repeatedSlowSource.id &&
    event.target?.beastId === sealingTarget.id &&
    event.debugCalculation?.slowDecrement?.decrementTriggered
  );
  assert(postSecondApplicationHits.length >= 2, 'sealed source must make two normal attacks after the second slow');
  assert.deepStrictEqual(
    postSecondApplicationHits[0].debugCalculation.slowDecrement.attacksUntilRemovalBefore,
    [1, 2],
    'first normal attack must see both independent slow effects'
  );
  assert.deepStrictEqual(
    postSecondApplicationHits[0].debugCalculation.slowDecrement.attacksUntilRemovalAfter,
    [0, 1],
    'first normal attack must decrement both matching effects independently'
  );
  assert.deepStrictEqual(
    postSecondApplicationHits[0].stateAfter.target.statuses.slowEffects.map(effect => effect.attacksUntilRemoval),
    [1],
    'only the zero-count effect must be removed'
  );
  assert.deepStrictEqual(
    postSecondApplicationHits[1].debugCalculation.slowDecrement.attacksUntilRemovalBefore,
    [1],
    'second normal attack must retain the remaining effect'
  );
  assert.deepStrictEqual(
    postSecondApplicationHits[1].debugCalculation.slowDecrement.attacksUntilRemovalAfter,
    [0],
    'second normal attack must expire the final effect'
  );
  assert.deepStrictEqual(
    postSecondApplicationHits[1].stateAfter.target.statuses.slowEffects,
    [],
    'all slow effects must be gone after their own counters reach zero'
  );
}

{
  const fighter = new app.Fighter(
    beast('test_slow_agi_sum', 'Slow AGI Sum', { agi: 200, atk: 1, dur: 1000, will: 1 }, []),
    'B-test'
  );
  fighter.slowEffects = [
    { id: 'slow-a', sourceInstanceId: 'A-0', targetInstanceId: 'B-test', attacksUntilRemoval: 1, agiDown: 50 },
    { id: 'slow-b', sourceInstanceId: 'A-0', targetInstanceId: 'B-test', attacksUntilRemoval: 2, agiDown: 50 },
  ];
  assert.strictEqual(fighter.getDisplayAGI(), 100, 'two active 50-point slow effects must reduce display AGI by 100');
  fighter.slowEffects = fighter.slowEffects.filter(effect => effect.id !== 'slow-a');
  assert.strictEqual(fighter.getDisplayAGI(), 150, 'removing one effect must restore only its own 50 display AGI');
  fighter.slowEffects = [];
  assert.strictEqual(fighter.getDisplayAGI(), 200, 'removing all effects must restore original display AGI');
}

{
  assert.strictEqual(
    app.ATTACK_SKILL_SPEED_AFFECTS_ACTION_GAUGE,
    false,
    'attack-skill speed must not affect the action gauge by default'
  );

  const slowSource = beast('test_speed_mode_source', 'Speed Mode Source', {
    agi: 180, atk: 1, dur: 1000, will: 1,
  }, [
    { name: '攻撃-減速', type: 'attack', rageCost: 0, effect: 'slow', param: 0.50 },
  ]);
  const slowTarget = beast('test_speed_mode_target', 'Speed Mode Target', {
    agi: 100, atk: 1, dur: 1000, will: 1,
  }, []);

  const run = attackSkillSpeedAffectsActionGauge => app.withSeededRandom(1122, () =>
    app.simulateBattle6v6(
      [slowSource],
      [slowTarget],
      true,
      { analysisMode: 'developer', attackSkillSpeedAffectsActionGauge }
    )
  );
  const gaugeOn = run(true);
  const gaugeOff = run(false);
  const gaugeDefault = run();
  const onActions = gaugeOn.analysisEvents.filter(event => event.eventType === 'action_start');
  const offActions = gaugeOff.analysisEvents.filter(event => event.eventType === 'action_start');
  const defaultActions = gaugeDefault.analysisEvents.filter(event => event.eventType === 'action_start');
  const onSlow = gaugeOn.analysisEvents.find(event => event.eventType === 'status' && event.skillId === 'slow');
  const offSlow = gaugeOff.analysisEvents.find(event => event.eventType === 'status' && event.skillId === 'slow');
  const defaultSlow = gaugeDefault.analysisEvents.find(event => event.eventType === 'status' && event.skillId === 'slow');

  assert.strictEqual(onSlow.stateAfter.target.agi, 50, 'gauge ON must apply slow to display AGI');
  assert.strictEqual(offSlow.stateAfter.target.agi, 50, 'gauge OFF must still apply slow to display AGI');
  assert.strictEqual(defaultSlow.stateAfter.target.agi, 50, 'default mode must apply slow to display AGI');
  assert.strictEqual(onSlow.debugCalculation.status.actionGaugeAgiAfter, 50, 'gauge ON must use slowed AGI for action timing');
  assert.strictEqual(offSlow.debugCalculation.status.actionGaugeAgiAfter, 100, 'gauge OFF must exclude attack-skill slow from action timing');
  assert.strictEqual(defaultSlow.debugCalculation.status.actionGaugeAgiAfter, 100, 'default action timing must exclude attack-skill slow');
  assert.strictEqual(onActions[1].actor.beastId, slowSource.id, 'gauge ON must delay the slowed target');
  assert.strictEqual(offActions[1].actor.beastId, slowTarget.id, 'gauge OFF must preserve the target action-gauge speed');
  assert.strictEqual(defaultActions[1].actor.beastId, slowTarget.id, 'default mode must preserve the target action-gauge speed');
  assert.strictEqual(
    gaugeOff.actionGaugeSpeedModifierEnabled[app.SpeedModifierType.ATTACK_SKILL],
    false,
    'result must expose the action-gauge speed policy used for the battle'
  );

  const rapidFighter = new app.Fighter(
    beast('test_warcry_speed_mode', 'Warcry Speed Mode', { agi: 100, atk: 1, dur: 1000, will: 1 }, [
      { name: '戦吼-急速', type: 'battlecry', effect: 'rapid', param: 0.12, param2: 0.08 },
    ]),
    'A-rapid',
    { [app.SpeedModifierType.ATTACK_SKILL]: false }
  );
  assert.strictEqual(rapidFighter.getDisplayAGI(), 112, 'warcry speed must affect display AGI');
  assert.strictEqual(rapidFighter.getActionGaugeAGI(), 112, 'warcry speed must always affect action-gauge AGI');

  const makeTypedModifierFighter = actionGaugeSpeedModifierEnabled => {
    const fighter = new app.Fighter(
      beast('test_typed_speed_modifiers', 'Typed Speed Modifiers', { agi: 100, atk: 1, dur: 1000, will: 1 }, []),
      'A-typed',
      actionGaugeSpeedModifierEnabled
    );
    fighter.addSpeedModifier({
      id: 'passive-speed',
      type: app.SpeedModifierType.PASSIVE,
      operation: 'multiply',
      value: 1.20,
    });
    fighter.addSpeedModifier({
      id: 'equipment-speed',
      type: app.SpeedModifierType.EQUIPMENT,
      operation: 'subtract',
      value: 10,
    });
    fighter.poisonStacks = 5;
    return fighter;
  };
  const typedDefault = makeTypedModifierFighter({});
  assert.strictEqual(typedDefault.getDisplayAGI(), 105, 'display AGI must include passive, equipment, and status modifiers');
  assert.strictEqual(typedDefault.getActionGaugeAGI(), 100, 'passive, equipment, and status must be disabled for action gauge by default');

  const typedEnabled = makeTypedModifierFighter({
    [app.SpeedModifierType.PASSIVE]: true,
    [app.SpeedModifierType.EQUIPMENT]: true,
    [app.SpeedModifierType.STATUS]: true,
  });
  assert.strictEqual(
    typedEnabled.getActionGaugeAGI(),
    105,
    'actionGaugeSpeedModifierEnabled must enable passive, equipment, and status modifiers by type'
  );
}

{
  const doomedSlowSource = beast('test_doomed_slow_source', 'Doomed Slow Source', {
    agi: 301, atk: 1, dur: 25, will: 67,
  }, [
    { name: '攻撃-減速', type: 'attack', rageCost: 40, effect: 'slow', param: 0.50 },
  ]);
  const replacement = beast('test_slow_source_replacement', 'Slow Source Replacement', {
    agi: 250, atk: 1, dur: 1000, will: 1,
  }, []);
  const persistentSlowTarget = beast('test_persistent_slow_target', 'Persistent Slow Target', {
    agi: 100, atk: 500, dur: 5000, will: 1,
  }, []);

  const result = app.withSeededRandom(1357, () =>
    app.simulateBattle6v6(
      [doomedSlowSource, replacement],
      [persistentSlowTarget],
      true,
      { analysisMode: 'developer' }
    )
  );
  const slowApplied = result.analysisEvents.find(event =>
    event.eventType === 'status' &&
    event.skillId === 'slow' &&
    event.actor?.beastId === doomedSlowSource.id
  );
  assert(slowApplied, 'doomed source must apply slow before being defeated');

  const sourceInstanceId = slowApplied.actor.instanceId;
  const targetInstanceId = slowApplied.target.instanceId;
  const sourceDefeat = result.analysisEvents.find(event =>
    event.eventType === 'defeat' &&
    event.defeated?.instanceId === sourceInstanceId
  );
  assert(sourceDefeat, 'slow source must be defeated after applying slow');

  const replacementHit = result.analysisEvents.find(event =>
    event.eventType === 'hit' &&
    event.actionNo > sourceDefeat.actionNo &&
    event.actor?.beastId === replacement.id &&
    event.target?.instanceId === targetInstanceId
  );
  assert(replacementHit, 'replacement must attack the persistent slow target');
  assert.strictEqual(
    replacementHit.debugCalculation.slowDecrement.decrementTriggered,
    false,
    'replacement attack must not decrement slow applied by the defeated source'
  );
  assert.strictEqual(
    replacementHit.debugCalculation.slowDecrement.decrementReason,
    'attacker_not_slow_source',
    'replacement mismatch must be explicit in the debug log'
  );
  assert.strictEqual(
    replacementHit.debugCalculation.slowDecrement.attacksUntilRemovalBefore[0],
    2,
    'slow must remain at two after its source is defeated'
  );
  assert.strictEqual(
    replacementHit.debugCalculation.slowDecrement.attacksUntilRemovalAfter[0],
    2,
    'replacement attack must leave persistent slow unchanged'
  );
  assert.strictEqual(
    replacementHit.stateAfter.target.statuses.slowEffects[0].attacksUntilRemoval,
    2,
    'slow must remain on the target after a different instance attacks'
  );
}

{
  const active = beast('test_entry_effective_agi_active', 'Entry Effective AGI Active', {
    agi: 120, atk: 500, dur: 1000, will: 1,
  }, []);
  const defeated = beast('test_entry_effective_agi_defeated', 'Entry Effective AGI Defeated', {
    agi: 50, atk: 1, dur: 1, will: 1,
  }, []);
  const rapidReplacement = beast('test_entry_effective_agi_rapid', 'Entry Effective AGI Rapid', {
    agi: 110, atk: 1, dur: 1000, will: 1,
  }, [
    { name: '戦吼-急速', type: 'battlecry', effect: 'rapid', param: 0.12, param2: 0.08 },
  ]);

  const result = app.withSeededRandom(987, () =>
    app.simulateBattle6v6([active], [defeated, rapidReplacement], true, { analysisMode: 'detail' })
  );
  const actions = result.analysisEvents.filter(event => event.eventType === 'action_start');

  assert.strictEqual(actions[0].actor.beastId, active.id, 'active fighter should defeat the first opponent');
  assert.strictEqual(rapidReplacement.agi, 110, 'test input should retain its base AGI');
  assert.strictEqual(
    actions[1].actor.beastId,
    rapidReplacement.id,
    'post-entry order must use effective AGI including rapid'
  );
  assert.strictEqual(actions[1].order.effectiveAgiB, 123, 'rapid replacement effective AGI must include the 12% speed bonus');
  assert.strictEqual(actions[1].order.effectiveAgiA, 120, 'remaining fighter effective AGI must be recalculated after entry');
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

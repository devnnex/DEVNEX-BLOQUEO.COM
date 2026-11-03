const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../js/project-guard.js');
const now = Date.parse('2026-11-03T15:00:00Z');
const scheduled = () => state.normalize({ project_id: 'TEST', status: 'warning', amount: 125000,
  message: 'Hola Elkin, acordemos el pago. 👋\nGracias.', deadline_at: new Date(now + 7200000).toISOString(),
  warning_hours: 2, warning_position: 'top-left', warning_top: 120 });

test('schedule survives a four-column backend round trip and another device', () => {
  const source = scheduled(), wire = JSON.parse(JSON.stringify(state.serialize(source)));
  assert.deepEqual(Object.keys(wire), ['project_id', 'status', 'amount', 'message']);
  assert.equal(wire.status, 'active');
  assert.deepEqual(state.normalize(wire), source);
});
test('reload and editing the message preserve the absolute deadline', () => {
  let source = scheduled();
  for (let i = 0; i < 10; i++) source = state.normalize(state.serialize(source));
  source.message = 'Un nuevo mensaje';
  assert.equal(state.normalize(state.serialize(source)).deadline_at, scheduled().deadline_at);
});
test('warning becomes blocking at the deadline, including after a closed tab', () => {
  assert.equal(state.status(scheduled(), now), 'warning');
  assert.equal(state.status(scheduled(), now + 7200000), 'blocked');
  assert.equal(state.status(scheduled(), now + 86400000), 'blocked');
  assert.deepEqual(state.remaining(scheduled().deadline_at, now + 86400000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
});
test('unlock removes deadline metadata from the persisted record', () => {
  const wire = state.serialize({ ...scheduled(), status: 'active', deadline_at: null });
  assert.equal(wire.message, scheduled().message);
  assert.equal(state.normalize(wire).deadline_at, null);
  assert.equal(state.status(state.normalize(wire), now + 86400000), 'active');
});
test('legacy active and blocked projects retain their behavior', () => {
  for (const status of ['active', 'blocked']) {
    const project = state.normalize({ project_id: 'OLD', status, amount: 500, message: 'Pago pendiente' });
    assert.equal(project.status, status);
    assert.equal(state.normalize(state.serialize(project)).message, project.message);
  }
});
test('position is bounded and malformed metadata remains readable', () => {
  assert.equal(state.normalize({warning_top:9999}).warning_top,600);
  assert.equal(state.normalize({warning_top:-5}).warning_top,0);
  assert.equal(state.normalize({warning_position:'bottom'}).warning_position,'top-right');
  for (const suffix of ['null', '%invalid', '[]']) {
    const message = `User text\n[DEVNEX_SCHEDULE_V1:${suffix}]`;
    assert.equal(state.normalize({message}).message,message);
  }
});
test('counter separates days, hours, minutes and seconds', () => {
  assert.deepEqual(state.remaining(new Date(now+90061000).toISOString(),now), {days:1,hours:1,minutes:1,seconds:1});
});

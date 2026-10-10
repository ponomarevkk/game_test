const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(js, 'Inline game JavaScript must exist');

function harness() {
  const nodes = new Map(), timers = new Map();
  let seq = 0;
  function el(id) {
    if (!nodes.has(id)) {
      const set = new Set();
      nodes.set(id, { textContent: '', innerHTML: '', onclick: null, classList: {
        add: x => set.add(x), remove: x => set.delete(x),
        toggle: (x, v) => v === undefined ? (set.has(x) ? set.delete(x) : set.add(x)) : (v ? set.add(x) : set.delete(x))
      } });
    }
    return nodes.get(id);
  }
  const document = {getElementById: el, addEventListener: () => {}};
  const setTimeout = fn => {let id = ++seq; timers.set(id, fn); return id};
  const clearTimeout = id => timers.delete(id);
  const api = new Function('document', 'setTimeout', 'clearTimeout',
    js + '\nreturn { initial, legal, play, take, finish, getState: () => s };'
  )(document, setTimeout, clearTimeout);
  return {api, timers};
}

test('Every referenced UI element exists in HTML', () => {
  for (const m of js.matchAll(/\$\('([^']+)'\)/g)) {
    assert.ok(html.includes('id="' + m[1] + '"'), 'Missing element #' + m[1]);
  }
});

test('Computer and two-player modes each complete 150 simulated games', () => {
  for (const mode of ['bot', 'local']) {
    for (let game = 0; game < 150; game++) {
      const {api, timers} = harness();
      api.initial(mode);
      let steps = 0;
      while (api.getState().result === null && steps < 500) {
        const s = api.getState();
        const cards = [...s.h[0], ...s.h[1], ...s.d, ...s.discard,
          ...s.pairs.flatMap(p => [p.a, p.d].filter(Boolean))];
        assert.equal(cards.length, 36, 'Card conservation');
        assert.equal(new Set(cards.map(c => c.id)).size, 36, 'Unique cards');
        if (mode === 'bot' && s.turn === 1) {
          const cb = [...timers.values()].at(-1);
          timers.clear();
          assert.ok(cb, 'Computer must make a move');
          cb();
        } else {
          const options = api.legal();
          if (s.phase === 'attack') {
            assert.ok(options.length, 'Attacker must have legal move');
            api.play(options[0].id);
          } else if (s.phase === 'defend') {
            if (options.length) api.play(options[0].id);
            else api.take();
          } else if (s.phase === 'throw' || s.phase === 'take') {
            if (s.phase === 'throw' && options.length && game % 4 === 0 && s.pairs.length < 2) {
              api.play(options[0].id);
            } else api.finish();
          } else assert.fail('Unknown phase: ' + s.phase);
        }
        steps++;
      }
      assert.notEqual(api.getState().result, null, 'Game must finish');
    }
  }
});

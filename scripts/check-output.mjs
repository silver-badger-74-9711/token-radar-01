import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';
const [input, output] = process.argv.slice(2);
const snapshot = JSON.parse(readFileSync(input, 'utf8'));
const doc = JSON.parse(readFileSync(join(output, 'board.json'), 'utf8'));
assert(doc && !Array.isArray(doc) && Array.isArray(doc.rows));
const rows = doc.rows;
assert(rows.length >= 100 && rows.length <= 4000);
const expected = snapshot.protocols.filter(p => p.mcap_usd === null && p.tvl_usd > 0);
const peers = snapshot.protocols.filter(p => p.mcap_usd !== null && p.tvl_usd > 0);
const median = values => { const a = values.sort((x,y) => x-y); const m = Math.floor(a.length/2); return a.length % 2 ? a[m] : (a[m-1]+a[m])/2; };
const globalMedian = median(peers.map(p => p.mcap_usd/p.tvl_usd));
assert.deepEqual(rows.map(r => r.slug).sort(), expected.map(p => p.slug).sort());
assert.equal(new Set(rows.map(r => r.slug)).size, rows.length);
assert.deepEqual(rows.map(r => r.rank).sort((a,b) => a-b), rows.map((_,i) => i+1));
assert(new Set(rows.map(r => r.implied_value_usd)).size > 1);
for (const slug of snapshot.watchlist) assert(rows.some(r => r.slug === slug));
for (const [i,r] of rows.entries()) {
  const p = expected.find(p => p.slug === r.slug);
  assert.equal(typeof r.name, 'string'); assert(r.name.trim());
  assert(Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14);
  if (i) {
    const prev = rows[i-1];
    assert(prev.implied_value_usd >= r.implied_value_usd);
    if (prev.implied_value_usd === r.implied_value_usd) {
      assert(prev.tvl_usd >= r.tvl_usd);
      if (prev.tvl_usd === r.tvl_usd) assert(prev.slug < r.slug);
    }
  }
  assert(Array.isArray(r.farm_steps) && r.farm_steps.length === 5);
  for (const s of r.farm_steps) {
    assert.equal(typeof s, 'string'); assert(s.trim().length >= 20 && s.trim().length <= 600);
    assert(s.includes(p.name) && s.includes('USD') && s.includes('minutes'));
    if (p.chains.length) assert(s.includes(p.chains[0]));
  }
  const categoryPeers = peers.filter(q => q.category === p.category);
  const multiple = Math.max(.02, Math.min(2, categoryPeers.length >= 4 ? median(categoryPeers.map(q => q.mcap_usd/q.tvl_usd)) : globalMedian));
  const age = p.listed_at === null ? 180 : Math.max(0, Math.floor((Date.parse(snapshot.as_of+'T00:00:00Z')-Date.parse(p.listed_at+'T00:00:00Z'))/86400000));
  const momentum = 1 + Math.max(-30, Math.min(60, p.change_7d ?? 0))/250;
  const maturity = .8 + .4 * Math.min(age,1460)/1460;
  const breadth = 1 + .015 * Math.min(p.chains.length-1,8);
  assert.equal(r.implied_value_usd, Math.max(1, Math.round(p.tvl_usd*multiple*momentum*maturity*breadth)));
  for (const [key,value] of Object.entries({ multiple, momentum, maturity, breadth, age_days: age, watchlist: snapshot.watchlist.includes(p.slug) })) assert.equal(r[key],value);
}
const context = { window: {} };
runInNewContext(readFileSync(join(output,'data.js'),'utf8'),context);
const radar = JSON.parse(JSON.stringify(context.window.RADAR));
assert.deepEqual(radar.rows, rows);
assert.equal(radar.model.global_median, globalMedian);
assert.equal(radar.model.as_of, snapshot.as_of);
for (const c of radar.model.category_multiples) assert.equal(c.peer_count, peers.filter(p => p.category === c.category).length);
console.log(`PASS: ${rows.length} rows; ${snapshot.watchlist.length} watchlist slugs; all gates, formulas, ordering, farm plans and dashboard data verified.`);

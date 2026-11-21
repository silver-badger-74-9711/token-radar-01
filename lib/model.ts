export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

// All arithmetic uses the sealed snapshot; dates are parsed at UTC midnight.
export class SnapshotError extends Error {}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function median(values: number[]): number {
  if (!values.length) throw new SnapshotError('No tokenized comparables with positive TVL');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// Each playbook describes preparation, entry, monitoring and exit without asserting rewards exist.
const PLAYBOOKS: Record<string, string[]> = {
  Dexs: ['inspect supported pairs, pool depth and swap fees', 'quote and execute a small swap with a slippage limit', 'compare the received amount with the quote and record fees', 'swap the test balance back and remove unused approvals'],
  Lending: ['inspect collateral rules, utilization and withdrawal liquidity', 'supply a supported asset without borrowing', 'check the supply balance, interest and available liquidity', 'withdraw the test supply and remove unused approvals'],
  'Liquid Staking': ['inspect supported staking assets, receipt tokens and exit queues', 'stake a supported native asset and save the receipt amount', 'compare the receipt exchange rate and pending rewards', 'request a small unstake and record the queue completion date'],
  Bridge: ['inspect supported routes, destination gas and finality requirements', 'bridge a small supported asset transfer on a confirmed route', 'match the source transaction to the destination receipt', 'quote a return transfer and execute only if fees fit the budget'],
  'Canonical Bridge': ['verify the official bridge route and withdrawal challenge period', 'send a small supported deposit through the official route', 'confirm the destination receipt and record finality status', 'initiate a test withdrawal and record any challenge waiting period'],
  Derivatives: ['inspect margin assets, funding rates and liquidation rules', 'deposit a small supported margin balance without opening leverage', 'review order previews and funding costs without submitting an order', 'withdraw the unused margin and record the actual fees'],
  Yield: ['inspect the yield source, lock period and withdrawal terms', 'deposit a supported asset into an unlocked yield position', 'compare accrued yield with fees and record the position balance', 'redeem the test position when its withdrawal terms permit'],
  'Yield Aggregator': ['inspect strategy allocations, management fees and vault exit rules', 'deposit a supported asset into a reviewed vault', 'check vault share value and strategy allocation changes', 'redeem the test vault shares and remove unused approvals'],
  RWA: ['check eligibility, identity requirements and redemption windows', 'subscribe to a supported asset only if eligible and minimums fit the budget', 'review the asset report and record redemption restrictions', 'request a permitted redemption and record its settlement date'],
  CEX: ['verify account eligibility, supported networks and withdrawal minimums', 'deposit a supported asset only after account verification', 'preview a small spot trade and record the quoted trading fee', 'withdraw the test balance to the verified network if minimums permit'],
  'Risk Curators': ['inspect the curator mandate, collateral exposure and vault caps', 'supply a supported asset to a reviewed curated vault', 'review collateral changes and available withdrawal liquidity', 'redeem test shares and record any withdrawal queue'],
  'Onchain Capital Allocator': ['inspect allocation policies, strategy exposure and redemption terms', 'deposit a supported asset into a reviewed allocation vault', 'compare current allocations with the published mandate', 'redeem the test allocation and record settlement timing'],
};
const FALLBACK = ['inspect the documented product, supported assets and exit conditions', 'preview the smallest supported interaction and execute only if its terms are clear', 'verify the transaction receipt and record any resulting position', 'close the test position using the documented exit flow if available'];
function farmSteps(p: SnapshotProtocol): string[] {
  const chain = p.chains.slice(0, 2).join(' and ') || 'the network specified in its official documentation';
  const tier = p.tvl_usd >= 1e9 ? { label: 'large-TVL', capital: 150, fee: 12, time: 12 }
    : p.tvl_usd >= 5e7 ? { label: 'mid-TVL', capital: 75, fee: 8, time: 15 }
    : { label: 'small-TVL', capital: 25, fee: 5, time: 20 };
  const actions = PLAYBOOKS[p.category ?? ''] ?? FALLBACK;
  return [
    `For ${p.name} on ${chain}, open the official documentation and verify app addresses; use the ${tier.label} test budget of $${tier.capital} USD. Estimated cost: $0 USD. Time: ${tier.time} minutes.`,
    ...actions.map((action, i) => `For ${p.name} on ${chain}, ${action}. ${i === 1 ? `Limit ${tier.label} test capital to $${tier.capital} USD; skip if minimums exceed it.` : `Use the ${tier.label} review checklist and save the result.`} Estimated cost: $${i === 1 || i === 3 ? tier.fee : 0} USD${i === 1 ? ' in fees, plus the stated capital' : ''}; actual fees vary. Time: ${i === 1 || i === 3 ? tier.time : 10} minutes${i === 3 ? ' active work; settlement may take longer' : ''}.`),
  ];
}

export function buildRadar(snapshot: Snapshot) {
  const live = snapshot.protocols.filter(p => p.mcap_usd !== null && p.tvl_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || compare(a.slug, b.slug));
  const globalMedian = median(live.map(p => p.mcap_usd! / p.tvl_usd));
  const categories = [...new Set(snapshot.protocols.map(p => p.category))]
    .sort((a, b) => compare(a ?? '', b ?? ''));
  const categoryMultiples = categories.map(category => {
    const peers = live.filter(p => p.category === category);
    const raw = peers.length >= 4 ? median(peers.map(p => p.mcap_usd! / p.tvl_usd)) : globalMedian;
    return { category, peer_count: peers.length, source: peers.length >= 4 ? 'category' : 'global', raw_multiple: raw, multiple: clamp(raw, 0.02, 2) };
  });
  const byCategory = new Map(categoryMultiples.map(c => [c.category, c.multiple]));
  const watchlist = new Set(snapshot.watchlist);
  const board = snapshot.protocols.filter(p => p.mcap_usd === null && p.tvl_usd > 0).map(p => {
    const age = p.listed_at === null ? 180 : Math.max(0, Math.floor((Date.parse(snapshot.as_of + 'T00:00:00Z') - Date.parse(p.listed_at + 'T00:00:00Z')) / 86400000));
    const multiple = byCategory.get(p.category)!;
    const momentum = 1 + clamp(p.change_7d ?? 0, -30, 60) / 250;
    const maturity = 0.8 + 0.4 * Math.min(age, 1460) / 1460;
    const breadth = 1 + 0.015 * Math.min(p.chains.length - 1, 8);
    return { ...p, rank: 0, token_status: 'pre-token', age_days: age, multiple,
      momentum, maturity, breadth, growth_multiplier: momentum, maturity_multiplier: maturity,
      watchlist: watchlist.has(p.slug),
      implied_value_usd: Math.max(1, Math.round(p.tvl_usd * multiple * momentum * maturity * breadth)),
      farm_steps: farmSteps(p) };
  }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || compare(a.slug, b.slug));
  board.forEach((row, i) => { row.rank = i + 1; });
  return { board, radar: {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
    model_version: 'comparables-1', model: { as_of: snapshot.as_of, global_median: globalMedian,
      global_peer_count: live.length, category_multiples: categoryMultiples,
      multiple_bounds: [0.02, 2], minimum_category_peers: 4, unknown_age_days: 180 },
    watchlist_size: watchlist.size, board_size: board.length,
    early_size: board.filter(p => !p.watchlist).length, live_size: live.length, rows: board, live,
  } };
}
export type BoardRow = ReturnType<typeof buildRadar>['board'][number];
export type RadarData = ReturnType<typeof buildRadar>['radar'];

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}


export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return 'Row count outside 100..4000';
  const index = new Map(snapshot.protocols.map(p => [p.slug, p]));
  const seen = new Set<string>();
  for (const [i, row] of board.entries()) {
    const p = index.get(row.slug);
    if (!p || p.mcap_usd !== null || p.tvl_usd <= 0 || seen.has(row.slug)) return 'Invalid or duplicate slug: ' + row.slug;
    seen.add(row.slug);
    if (!row.name.trim() || row.rank !== i + 1) return 'Invalid name or rank: ' + row.slug;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 1e14) return 'Invalid value: ' + row.slug;
    if (i && row.implied_value_usd > board[i - 1]!.implied_value_usd) return 'Values are not descending';
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12 || row.farm_steps.some(s => typeof s !== 'string' || s.trim().length < 20 || s.trim().length > 600)) return 'Invalid farm steps: ' + row.slug;
  }
  if (snapshot.watchlist.some(s => !seen.has(s))) return 'Missing watchlist protocol';
  if (new Set(board.map(r => r.implied_value_usd)).size < 2) return 'All values equal';
  return null;
}
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar).replace(/</g, '\\u003c')};\n`;
}

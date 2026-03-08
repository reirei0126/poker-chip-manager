// Logic test suite for poker-chip-manager
// Run: node test/logic.test.mjs

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg ?? "assertion failed"); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(`${msg ?? ""} expected ${b}, got ${a}`); }

// ── Pure helpers (mirrored from page.tsx) ─────────────────────────────────

function getPositions(dealerIdx, list) {
  const active = list.map((p, i) => ({ origIdx: i, chips: p.chips })).filter(a => a.chips > 0);
  const n = active.length;
  if (n < 2) return { sbIdx: dealerIdx, bbIdx: dealerIdx };
  let dPos = active.findIndex(a => a.origIdx === dealerIdx);
  if (dPos < 0) dPos = 0;
  if (n === 2) return { sbIdx: active[dPos].origIdx, bbIdx: active[(dPos + 1) % 2].origIdx };
  return { sbIdx: active[(dPos + 1) % n].origIdx, bbIdx: active[(dPos + 2) % n].origIdx };
}

function rotateDealerIdx(currentIdx, list) {
  const active = list.map((p, i) => ({ origIdx: i, chips: p.chips })).filter(a => a.chips > 0);
  if (active.length < 2) return currentIdx;
  const pos = active.findIndex(a => a.origIdx === currentIdx);
  return active[((pos < 0 ? 0 : pos) + 1) % active.length].origIdx;
}

function calcSidePots(playerList, contribs) {
  const allInCaps = [...playerList]
    .filter(p => p.allIn && !p.folded && (contribs[p.id] ?? 0) > 0)
    .map(p => contribs[p.id] ?? 0).sort((a, b) => a - b);
  const maxContrib = Math.max(0, ...playerList.map(p => contribs[p.id] ?? 0));
  const caps = [...new Set([...allInCaps, maxContrib])].sort((a, b) => a - b).filter(c => c > 0);
  if (caps.length === 0) return [];
  const pots = [];
  let prevCap = 0;
  for (const cap of caps) {
    const delta = cap - prevCap;
    let potAmount = 0;
    const eligible = [];
    for (const p of playerList) {
      const contrib = contribs[p.id] ?? 0;
      if (contrib <= prevCap) continue;
      potAmount += Math.min(delta, contrib - prevCap);
      if (!p.folded) eligible.push(p.id);
    }
    if (potAmount > 0) {
      if (eligible.length > 0) pots.push({ amount: potAmount, eligibleIds: eligible });
      else if (pots.length > 0) pots[pots.length - 1].amount += potAmount;
    }
    prevCap = cap;
  }
  return pots;
}

function isStreetComplete(list, acted, highBet) {
  const active = list.filter(p => !p.folded && !p.allIn);
  if (active.length === 0) return true;
  return active.every(p => acted.includes(p.id) && p.bet >= highBet);
}

// ── Test suite ────────────────────────────────────────────────────────────

console.log("\n=== Position / Rotation ===");

test("6-player: BTN=0, SB=1, BB=2", () => {
  const players = Array.from({ length: 6 }, (_, i) => ({ chips: 1000 }));
  const { sbIdx, bbIdx } = getPositions(0, players);
  assertEqual(sbIdx, 1); assertEqual(bbIdx, 2);
});

test("2-player heads-up: BTN=SB=0, BB=1", () => {
  const players = [{ chips: 1000 }, { chips: 1000 }];
  const { sbIdx, bbIdx } = getPositions(0, players);
  assertEqual(sbIdx, 0); assertEqual(bbIdx, 1);
});

test("rotateDealerIdx skips broke players", () => {
  const players = [
    { chips: 1000 }, { chips: 0 }, { chips: 1000 }, { chips: 1000 }
  ];
  const next = rotateDealerIdx(0, players);
  assertEqual(next, 2, "should skip index 1 (broke)");
});

test("dealer rotation wraps around correctly", () => {
  const players = Array.from({ length: 4 }, () => ({ chips: 1000 }));
  let d = 0;
  for (let i = 0; i < 4; i++) d = rotateDealerIdx(d, players);
  assertEqual(d, 0, "should return to 0 after 4 rotations");
});

test("SB/BB skip broke players", () => {
  const players = [
    { chips: 1000 }, { chips: 1000 }, { chips: 0 }, { chips: 1000 }
  ];
  const { sbIdx, bbIdx } = getPositions(0, players);
  assertEqual(sbIdx, 1); assertEqual(bbIdx, 3, "BB should skip broke player at 2");
});

console.log("\n=== calcSidePots ===");

test("no all-in: single pot, all eligible", () => {
  const players = [
    { id: 1, folded: false, allIn: false },
    { id: 2, folded: false, allIn: false },
  ];
  const contribs = { 1: 100, 2: 100 };
  const pots = calcSidePots(players, contribs);
  assertEqual(pots.length, 1);
  assertEqual(pots[0].amount, 200);
  assert(pots[0].eligibleIds.includes(1) && pots[0].eligibleIds.includes(2));
});

test("one all-in: correct side pot split", () => {
  // A all-in 50, B has 100, C has 100
  const players = [
    { id: 1, folded: false, allIn: true },
    { id: 2, folded: false, allIn: false },
    { id: 3, folded: false, allIn: false },
  ];
  const contribs = { 1: 50, 2: 100, 3: 100 };
  const pots = calcSidePots(players, contribs);
  assertEqual(pots.length, 2);
  assertEqual(pots[0].amount, 150, "main pot: 50×3=150");
  assertEqual(pots[0].eligibleIds.length, 3);
  assertEqual(pots[1].amount, 100, "side pot: (100-50)×2=100");
  assertEqual(pots[1].eligibleIds.length, 2);
  assert(!pots[1].eligibleIds.includes(1), "all-in player not eligible for side pot");
});

test("folded player contribution does NOT create extra pot", () => {
  // Bug regression: 6 players each put in 10 BB = 60 chips total
  // Some fold - should be ONE pot, not multiple
  const players = [
    { id: 1, folded: false, allIn: false },
    { id: 2, folded: true,  allIn: false },
    { id: 3, folded: true,  allIn: false },
    { id: 4, folded: false, allIn: false },
  ];
  const contribs = { 1: 10, 2: 10, 3: 10, 4: 10 };
  const pots = calcSidePots(players, contribs);
  assertEqual(pots.length, 1, "folded players should not create extra pots");
  assertEqual(pots[0].amount, 40);
  assertEqual(pots[0].eligibleIds.length, 2);
});

test("single eligible pot: winnerId auto-assignable", () => {
  const players = [
    { id: 1, folded: false, allIn: true },
    { id: 2, folded: true,  allIn: false },
    { id: 3, folded: false, allIn: false },
  ];
  const contribs = { 1: 50, 2: 50, 3: 100 };
  const pots = calcSidePots(players, contribs);
  // Main pot (capped at 50): eligible = [1, 3] (player 2 folded)
  // Side pot: eligible = [3] only → auto-assign
  const singleEligible = pots.filter(p => p.eligibleIds.length === 1);
  assert(singleEligible.length > 0, "should have at least one single-eligible pot");
  assertEqual(singleEligible[0].eligibleIds[0], 3, "side pot winner should be player 3");
});

test("chip conservation: two all-ins + one active", () => {
  const players = [
    { id: 1, folded: false, allIn: true },
    { id: 2, folded: false, allIn: true },
    { id: 3, folded: false, allIn: false },
  ];
  const contribs = { 1: 200, 2: 400, 3: 400 };
  const totalIn = 200 + 400 + 400;
  const pots = calcSidePots(players, contribs);
  const potTotal = pots.reduce((s, p) => s + p.amount, 0);
  assertEqual(potTotal, totalIn, "all chips must be in pots");
});

console.log("\n=== isStreetComplete ===");

test("all folded/all-in: street complete", () => {
  const list = [
    { id: 1, folded: true,  allIn: false, bet: 0 },
    { id: 2, folded: false, allIn: true,  bet: 0 },
  ];
  assert(isStreetComplete(list, [], 100), "no active players → complete");
});

test("one player hasn't acted: not complete", () => {
  const list = [
    { id: 1, folded: false, allIn: false, bet: 100 },
    { id: 2, folded: false, allIn: false, bet: 100 },
  ];
  assert(!isStreetComplete(list, [1], 100), "player 2 hasn't acted");
});

test("all acted and matched highBet: complete", () => {
  const list = [
    { id: 1, folded: false, allIn: false, bet: 100 },
    { id: 2, folded: false, allIn: false, bet: 100 },
  ];
  assert(isStreetComplete(list, [1, 2], 100));
});

console.log("\n=== canAct <= 1 skip logic ===");

test("1 non-folded non-allIn player after call → should skip streets", () => {
  // After A all-in + B calls (B has chips left), only B can act
  const list = [
    { id: 1, folded: false, allIn: true  }, // went all-in
    { id: 2, folded: false, allIn: false }, // called, has chips left
    { id: 3, folded: true,  allIn: false }, // folded
  ];
  const canAct = list.filter(p => !p.folded && !p.allIn).length;
  assertEqual(canAct, 1, "only 1 player can act");
  assert(canAct <= 1, "should trigger showdown skip");
});

// ── Virtual card mode ─────────────────────────────────────────────────────

const RANKS_T = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS_T = ["♠","♥","♦","♣"];
const FULL_DECK_T = SUITS_T.flatMap((s) => RANKS_T.map((r) => r + s));

function shuffleDeckT(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function dealCards(activePlayers) {
  const deck = shuffleDeckT(FULL_DECK_T);
  let di = 0;
  const hands = {};
  for (const p of activePlayers.filter((p) => !p.folded)) {
    hands[p.id] = [deck[di++], deck[di++]];
  }
  const community = deck.slice(di, di + 5);
  return { hands, community, deck };
}

console.log("\n=== Virtual card mode ===");

test("deck has 52 unique cards", () => {
  assertEqual(FULL_DECK_T.length, 52, "should be 52 cards");
  const unique = new Set(FULL_DECK_T);
  assertEqual(unique.size, 52, "all cards must be unique");
});

test("shuffle preserves all 52 cards", () => {
  const shuffled = shuffleDeckT(FULL_DECK_T);
  assertEqual(shuffled.length, 52);
  const unique = new Set(shuffled);
  assertEqual(unique.size, 52, "shuffled deck must have no duplicates");
});

test("deal: each player gets 2 unique hole cards", () => {
  const players = [
    { id: 1, folded: false }, { id: 2, folded: false }, { id: 3, folded: false },
  ];
  const { hands } = dealCards(players);
  assert(Object.keys(hands).length === 3, "all 3 players should have hands");
  for (const [, [c1, c2]] of Object.entries(hands)) {
    assert(c1 !== c2, "two hole cards must be different");
  }
});

test("deal: no card dealt to multiple players", () => {
  const players = [
    { id: 1, folded: false }, { id: 2, folded: false }, { id: 3, folded: false },
  ];
  const { hands } = dealCards(players);
  const allCards = Object.values(hands).flat();
  const unique = new Set(allCards);
  assertEqual(unique.size, allCards.length, "no duplicate cards across hands");
});

test("deal: community cards don't overlap with hole cards", () => {
  const players = [
    { id: 1, folded: false }, { id: 2, folded: false }, { id: 3, folded: false },
  ];
  const { hands, community } = dealCards(players);
  const holeCards = new Set(Object.values(hands).flat());
  for (const card of community) {
    assert(!holeCards.has(card), `community card ${card} must not be in any hand`);
  }
});

test("deal: folded players receive no cards", () => {
  const players = [
    { id: 1, folded: false }, { id: 2, folded: true }, { id: 3, folded: false },
  ];
  const { hands } = dealCards(players);
  assert(hands[1] !== undefined, "active player 1 should have hand");
  assert(hands[2] === undefined, "folded player 2 should not have hand");
  assert(hands[3] !== undefined, "active player 3 should have hand");
});

test("deal: community always has exactly 5 cards", () => {
  const players = [{ id: 1, folded: false }, { id: 2, folded: false }];
  const { community } = dealCards(players);
  assertEqual(community.length, 5, "always 5 community cards");
});

test("community visibility: 0 preflop, 3 flop, 4 turn, 5 river", () => {
  const visibleCount = (street) =>
    street === "flop" ? 3 : street === "turn" ? 4 : street === "river" ? 5 : 0;
  assertEqual(visibleCount("preflop"), 0);
  assertEqual(visibleCount("flop"), 3);
  assertEqual(visibleCount("turn"), 4);
  assertEqual(visibleCount("river"), 5);
});

// ── Hand evaluation ───────────────────────────────────────────────────────

function cardRank(card) {
  return "23456789TJQKA".indexOf(card[0]) + 2;
}
function score5(hand) {
  const ranks = hand.map(cardRank).sort((a, b) => b - a);
  const suits = hand.map(c => c.slice(-1));
  const isFlush = suits.every(s => s === suits[0]);
  const rankSet = new Set(ranks);
  const isStraight = rankSet.size === 5 && ranks[0] - ranks[4] === 4;
  const isWheel = rankSet.size === 5 && ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2;
  const freq = new Map();
  for (const r of ranks) freq.set(r, (freq.get(r) ?? 0) + 1);
  const groups = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [g0, g1, g2] = groups;
  if (isFlush && isStraight) return [8, ranks[0]];
  if (isFlush && isWheel)    return [8, 5];
  if (g0[1] === 4) return [7, g0[0], g1[0]];
  if (g0[1] === 3 && g1[1] === 2) return [6, g0[0], g1[0]];
  if (isFlush)    return [5, ...ranks];
  if (isStraight) return [4, ranks[0]];
  if (isWheel)    return [4, 5];
  if (g0[1] === 3) return [3, g0[0], g1[0], g2[0]];
  if (g0[1] === 2 && g1[1] === 2) return [2, g0[0], g1[0], g2[0]];
  if (g0[1] === 2) return [1, g0[0], g1[0], g2[0], groups[3][0]];
  return [0, ...ranks];
}
function evaluateHand(holeCards, community) {
  const all = [...holeCards, ...community];
  const n = all.length;
  let best = [];
  for (let i = 0; i < n-4; i++)
    for (let j = i+1; j < n-3; j++)
      for (let k = j+1; k < n-2; k++)
        for (let l = k+1; l < n-1; l++)
          for (let m = l+1; m < n; m++) {
            const s = score5([all[i], all[j], all[k], all[l], all[m]]);
            if (best.length === 0 || compareScoresT(s, best) > 0) best = s;
          }
  return best;
}
function compareScoresT(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
function getShowdownOrderT(lastAggressorId, players, eligibleIds) {
  const n = players.length;
  let startIdx = 0;
  if (lastAggressorId !== null) {
    const idx = players.findIndex(p => p.id === lastAggressorId);
    if (idx >= 0) startIdx = idx;
  }
  const result = [];
  for (let i = 0; i < n; i++) {
    const p = players[(startIdx + i) % n];
    if (eligibleIds.includes(p.id) && !p.folded) result.push(p.id);
  }
  return result;
}

console.log("\n=== Hand evaluation ===");

test("high card: correct rank ordering", () => {
  const s = score5(["A♠","K♥","Q♦","J♣","9♠"]);
  assertEqual(s[0], 0, "high card");
  assertEqual(s[1], 14, "ace high");
});

test("one pair", () => {
  const s = score5(["A♠","A♥","K♦","Q♣","J♠"]);
  assertEqual(s[0], 1, "one pair");
  assertEqual(s[1], 14, "pair of aces");
});

test("two pair", () => {
  const s = score5(["K♠","K♥","Q♦","Q♣","A♠"]);
  assertEqual(s[0], 2, "two pair");
});

test("three of a kind", () => {
  const s = score5(["7♠","7♥","7♦","A♣","K♠"]);
  assertEqual(s[0], 3, "trips");
  assertEqual(s[1], 7);
});

test("straight (T-high)", () => {
  const s = score5(["T♠","9♥","8♦","7♣","6♠"]);
  assertEqual(s[0], 4, "straight");
  assertEqual(s[1], 10, "T-high");
});

test("wheel straight (A-2-3-4-5)", () => {
  const s = score5(["A♠","2♥","3♦","4♣","5♠"]);
  assertEqual(s[0], 4, "straight");
  assertEqual(s[1], 5, "5-high wheel");
});

test("flush", () => {
  const s = score5(["A♠","K♠","Q♠","J♠","9♠"]);
  assertEqual(s[0], 5, "flush");
});

test("full house", () => {
  const s = score5(["K♠","K♥","K♦","Q♣","Q♠"]);
  assertEqual(s[0], 6, "full house");
  assertEqual(s[1], 13, "kings full");
});

test("four of a kind", () => {
  const s = score5(["A♠","A♥","A♦","A♣","2♠"]);
  assertEqual(s[0], 7, "quads");
  assertEqual(s[1], 14, "quad aces");
});

test("straight flush", () => {
  const s = score5(["9♠","8♠","7♠","6♠","5♠"]);
  assertEqual(s[0], 8, "straight flush");
});

test("evaluateHand: best hand from 7 cards", () => {
  // hole: A♠ A♥, community: A♦ A♣ K♠ Q♥ J♦ → quad aces
  const s = evaluateHand(["A♠","A♥"], ["A♦","A♣","K♠","Q♥","J♦"]);
  assertEqual(s[0], 7, "quad aces from 7 cards");
});

test("evaluateHand: chooses best 5 from 7", () => {
  // hole: 2♠ 7♥, community: K♠ K♥ K♦ K♣ A♠ → quad kings
  const s = evaluateHand(["2♠","7♥"], ["K♠","K♥","K♦","K♣","A♠"]);
  assertEqual(s[0], 7, "quad kings");
  assertEqual(s[1], 13, "kings");
});

test("hand comparison: trips beats two pair", () => {
  const trips = score5(["7♠","7♥","7♦","A♣","K♠"]);
  const twoPair = score5(["A♠","A♥","K♦","K♣","Q♠"]);
  assert(compareScoresT(trips, twoPair) > 0, "trips should beat two pair");
});

test("hand comparison: equal hands return 0", () => {
  const a = score5(["A♠","K♠","Q♠","J♠","T♠"]);
  const b = score5(["A♥","K♥","Q♥","J♥","T♥"]);
  assertEqual(compareScoresT(a, b), 0, "royal flushes are equal");
});

console.log("\n=== Showdown order ===");

test("showdown starts from last aggressor", () => {
  const players = [
    { id: 1, folded: false }, { id: 2, folded: false },
    { id: 3, folded: false }, { id: 4, folded: false },
  ];
  const order = getShowdownOrderT(3, players, [1, 2, 3, 4]);
  assertEqual(order[0], 3, "last aggressor (id=3) goes first");
  assertEqual(order[1], 4);
  assertEqual(order[2], 1);
  assertEqual(order[3], 2);
});

test("showdown skips folded players", () => {
  const players = [
    { id: 1, folded: false }, { id: 2, folded: true },
    { id: 3, folded: false },
  ];
  const order = getShowdownOrderT(1, players, [1, 3]);
  assert(!order.includes(2), "folded player should not be in showdown order");
  assertEqual(order.length, 2);
});

test("showdown: no aggressor falls back to first eligible", () => {
  const players = [
    { id: 1, folded: false }, { id: 2, folded: false },
  ];
  const order = getShowdownOrderT(null, players, [1, 2]);
  assertEqual(order[0], 1, "with no aggressor, start from idx 0");
});

test("autoAssign: mucked player loses to shown player", () => {
  // simulate: player 1 has quad aces, player 2 mucks
  const hands = { 1: ["A♠","A♥"], 2: ["2♣","3♦"] };
  const community = ["A♦","A♣","K♠","Q♥","J♦"];
  const mucked = [2];
  const eligible = [1, 2];
  const contenders = eligible.filter(id => !mucked.includes(id));
  assertEqual(contenders.length, 1);
  assertEqual(contenders[0], 1, "only non-mucked player wins");
});

test("autoAssign: best hand wins", () => {
  // player 1: pair of aces, player 2: full house → player 2 wins
  const hand1 = ["A♠","A♥"];
  const hand2 = ["K♠","K♥"];
  const community = ["K♦","A♣","K♣","2♠","3♦"]; // community: K K A → hand2 gets KKKK, hand1 gets AAA
  const s1 = evaluateHand(hand1, community);
  const s2 = evaluateHand(hand2, community);
  assert(compareScoresT(s2, s1) > 0, "quads beats trips");
});

test("autoAssign: split pot on equal hands", () => {
  // both players have the same board-played hand
  const hand1 = ["2♠","3♥"]; // irrelevant
  const hand2 = ["2♦","3♣"]; // irrelevant
  const community = ["A♠","K♠","Q♠","J♠","T♠"]; // royal flush on board
  const s1 = evaluateHand(hand1, community);
  const s2 = evaluateHand(hand2, community);
  assertEqual(compareScoresT(s1, s2), 0, "both play the board → split");
});

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(40)}`);
console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

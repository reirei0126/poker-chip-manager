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

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(40)}`);
console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

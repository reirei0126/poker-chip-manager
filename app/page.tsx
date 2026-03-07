"use client";

import { useState, useEffect } from "react";

type Player = {
  id: number;
  name: string;
  chips: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
};

type GameState = "setup" | "betting" | "result" | "ended";
type Street = "preflop" | "flop" | "turn" | "river";

type FrozenPot = {
  amount: number;
  eligibleIds: number[];
  winnerId: number | null;
  splitMode: boolean;
  splitSelectedIds: number[];
};

const STREETS: Street[] = ["preflop", "flop", "turn", "river"];
const STREET_LABELS: Record<Street, string> = {
  preflop: "Pre-Flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

const STORAGE_KEY = "poker-chip-manager-v1";

// ── Pure helpers (outside component) ─────────────────────────────────

function getPositions(dealerIdx: number, list: Player[]) {
  const active = list
    .map((p, i) => ({ origIdx: i, chips: p.chips }))
    .filter((a) => a.chips > 0);
  const n = active.length;
  if (n < 2) return { sbIdx: dealerIdx, bbIdx: dealerIdx };
  let dPos = active.findIndex((a) => a.origIdx === dealerIdx);
  if (dPos < 0) dPos = 0;
  if (n === 2) {
    return {
      sbIdx: active[dPos].origIdx,
      bbIdx: active[(dPos + 1) % 2].origIdx,
    };
  }
  return {
    sbIdx: active[(dPos + 1) % n].origIdx,
    bbIdx: active[(dPos + 2) % n].origIdx,
  };
}

function rotateDealerIdx(currentIdx: number, list: Player[]): number {
  const active = list
    .map((p, i) => ({ origIdx: i, chips: p.chips }))
    .filter((a) => a.chips > 0);
  if (active.length < 2) return currentIdx;
  const pos = active.findIndex((a) => a.origIdx === currentIdx);
  return active[((pos < 0 ? 0 : pos) + 1) % active.length].origIdx;
}

function calcSidePots(
  playerList: Player[],
  contribs: Record<number, number>
): { amount: number; eligibleIds: number[] }[] {
  // Only all-in players create cap levels (folded players don't split the pot)
  const allInCaps = [...playerList]
    .filter((p) => p.allIn && !p.folded && (contribs[p.id] ?? 0) > 0)
    .map((p) => contribs[p.id] ?? 0)
    .sort((a, b) => a - b);
  const maxContrib = Math.max(0, ...playerList.map((p) => contribs[p.id] ?? 0));
  const caps = [...new Set([...allInCaps, maxContrib])].sort((a, b) => a - b).filter((c) => c > 0);
  if (caps.length === 0) return [];

  const pots: { amount: number; eligibleIds: number[] }[] = [];
  let prevCap = 0;
  for (const cap of caps) {
    const delta = cap - prevCap;
    let potAmount = 0;
    const eligible: number[] = [];
    for (const p of playerList) {
      const contrib = contribs[p.id] ?? 0;
      if (contrib <= prevCap) continue;
      const take = Math.min(delta, contrib - prevCap);
      potAmount += take;
      if (!p.folded) eligible.push(p.id);
    }
    if (potAmount > 0) {
      if (eligible.length > 0) {
        pots.push({ amount: potAmount, eligibleIds: eligible });
      } else if (pots.length > 0) {
        pots[pots.length - 1].amount += potAmount;
      }
    }
    prevCap = cap;
  }
  return pots;
}

// ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [gameState, setGameState] = useState<GameState>("setup");
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [startingChips, setStartingChips] = useState(1000);
  const [sbAmount, setSbAmount] = useState(5);
  const [bbAmount, setBbAmount] = useState(10);
  const [pot, setPot] = useState(0);
  const [betInput, setBetInput] = useState<Record<number, string>>({});
  const [winner, setWinner] = useState<number | null>(null);
  const [street, setStreet] = useState<Street>("preflop");
  const [dealerIndex, setDealerIndex] = useState(0);
  const [currentHighBet, setCurrentHighBet] = useState(0);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [handContrib, setHandContrib] = useState<Record<number, number>>({});
  const [splitMode, setSplitMode] = useState(false);
  const [splitWinnerIds, setSplitWinnerIds] = useState<number[]>([]);
  const [frozenPots, setFrozenPots] = useState<FrozenPot[] | null>(null);
  const [sbIdx, setSbIdx] = useState(0);
  const [bbIdx, setBbIdx] = useState(0);
  const [rebuyAmount, setRebuyAmount] = useState(1000);
  const [actedThisStreet, setActedThisStreet] = useState<number[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [nameError, setNameError] = useState("");
  const [sessionStartChips, setSessionStartChips] = useState<Record<number, number>>({});
  const [totalRebuyChips, setTotalRebuyChips] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState(false);

  // ── localStorage load ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        setGameState(s.gameState ?? "setup");
        setPlayers(s.players ?? []);
        setStartingChips(s.startingChips ?? 1000);
        setSbAmount(s.sbAmount ?? 5);
        setBbAmount(s.bbAmount ?? 10);
        setPot(s.pot ?? 0);
        setWinner(s.winner ?? null);
        setStreet(s.street ?? "preflop");
        setDealerIndex(s.dealerIndex ?? 0);
        setCurrentHighBet(s.currentHighBet ?? 0);
        setActivePlayerIndex(s.activePlayerIndex ?? 0);
        setHandContrib(s.handContrib ?? {});
        setFrozenPots(s.frozenPots ?? null);
        setSbIdx(s.sbIdx ?? 0);
        setBbIdx(s.bbIdx ?? 0);
        setRebuyAmount(s.rebuyAmount ?? s.addonAmount ?? 1000);
        setActedThisStreet(s.actedThisStreet ?? []);
        setSessionStartChips(s.sessionStartChips ?? {});
        setTotalRebuyChips(s.totalRebuyChips ?? {});
      }
    } catch {}
    setLoaded(true);
  }, []);

  // ── localStorage save ─────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          gameState, players, startingChips, sbAmount, bbAmount, pot, winner,
          street, dealerIndex, currentHighBet, activePlayerIndex, handContrib,
          frozenPots, sbIdx, bbIdx, rebuyAmount, actedThisStreet,
          sessionStartChips, totalRebuyChips,
        })
      );
    } catch {}
  }, [loaded, gameState, players, startingChips, sbAmount, bbAmount, pot, winner,
    street, dealerIndex, currentHighBet, activePlayerIndex, handContrib,
    frozenPots, sbIdx, bbIdx, rebuyAmount, actedThisStreet,
    sessionStartChips, totalRebuyChips]);

  // ── Internal helpers ──────────────────────────────────────────────
  const nextActiveFrom = (fromIdx: number, list: Player[]): number => {
    for (let i = 1; i < list.length; i++) {
      const idx = (fromIdx + i) % list.length;
      if (!list[idx].folded && !list[idx].allIn) return idx;
    }
    return fromIdx;
  };

  const getPositionLabel = (playerIndex: number): string | null => {
    const isBtn = playerIndex === dealerIndex && players[playerIndex]?.chips > 0;
    const isSb = playerIndex === sbIdx;
    const isBb = playerIndex === bbIdx;
    if (isBtn && isSb) return "BTN/SB";
    if (isBtn) return "BTN";
    if (isSb) return "SB";
    if (isBb) return "BB";
    return null;
  };

  const applyBlind = (
    playerIdx: number,
    amount: number,
    list: Player[],
    contribs: Record<number, number>
  ): [Player[], Record<number, number>] => {
    const p = list[playerIdx];
    const actual = Math.min(amount, p.chips);
    const newList = list.map((pl, i) =>
      i !== playerIdx
        ? pl
        : { ...pl, chips: pl.chips - actual, bet: pl.bet + actual, allIn: pl.chips - actual === 0 }
    );
    return [newList, { ...contribs, [p.id]: (contribs[p.id] ?? 0) + actual }];
  };

  const initHand = (dealerIdx: number, baseList: Player[]) => {
    const list0 = baseList.map((p) => ({
      ...p, bet: 0, folded: p.chips === 0, allIn: false,
    }));
    const { sbIdx: sb, bbIdx: bb } = getPositions(dealerIdx, list0);
    let list = list0;
    let contribs: Record<number, number> = Object.fromEntries(baseList.map((p) => [p.id, 0]));
    [list, contribs] = applyBlind(sb, sbAmount, list, contribs);
    [list, contribs] = applyBlind(bb, bbAmount, list, contribs);
    return { list, contribs, firstActive: nextActiveFrom(bb, list), sb, bb };
  };

  // ── Setup ─────────────────────────────────────────────────────────
  const addPlayer = () => {
    const name = newPlayerName.trim();
    if (!name) return;
    if (players.length >= 9) { setNameError("プレイヤーは最大9人です"); return; }
    if (players.some((p) => p.name === name)) { setNameError("同じ名前のプレイヤーが既にいます"); return; }
    setNameError("");
    setPlayers((prev) => [
      ...prev,
      { id: Date.now(), name, chips: startingChips, bet: 0, folded: false, allIn: false },
    ]);
    setNewPlayerName("");
  };

  const removePlayer = (id: number) => setPlayers((prev) => prev.filter((p) => p.id !== id));

  const startGame = () => {
    if (players.length < 2) return;
    const { list, contribs, firstActive, sb, bb } = initHand(dealerIndex, players);
    setPlayers(list);
    setHandContrib(contribs);
    setCurrentHighBet(bbAmount);
    setStreet("preflop");
    setPot(0);
    setWinner(null);
    setSplitWinnerIds([]);
    setSplitMode(false);
    setFrozenPots(null);
    setActivePlayerIndex(firstActive);
    setSbIdx(sb);
    setBbIdx(bb);
    setActedThisStreet([]);
    setSessionStartChips(Object.fromEntries(players.map((p) => [p.id, p.chips])));
    setTotalRebuyChips(Object.fromEntries(players.map((p) => [p.id, 0])));
    setGameState("betting");
  };

  // ── Actions ───────────────────────────────────────────────────────
  const addContrib = (playerId: number, amount: number) =>
    setHandContrib((prev) => ({ ...prev, [playerId]: (prev[playerId] ?? 0) + amount }));

  const afterAction = (playerId: number, updatedList: Player[]) => {
    const idx = updatedList.findIndex((p) => p.id === playerId);
    setActivePlayerIndex(nextActiveFrom(idx, updatedList));
  };

  // Fix 1 & 4: auto-award when last player standing
  const autoAwardPot = (winnerId: number, updatedPlayers: Player[]) => {
    const totalBets = updatedPlayers.reduce((sum, p) => sum + p.bet, 0);
    const totalPot = pot + totalBets;
    const finalPlayers = updatedPlayers.map((p) =>
      p.id === winnerId ? { ...p, chips: p.chips + totalPot, bet: 0 } : { ...p, bet: 0 }
    );
    if (finalPlayers.some((p) => p.chips === 0)) {
      setPlayers(finalPlayers);
      setWinner(winnerId);
      setPot(0);
      setGameState("result");
    } else {
      startNextHand(finalPlayers);
    }
  };

  // helper: is the current betting round complete?
  const isStreetComplete = (list: Player[], acted: number[], highBet: number): boolean => {
    const active = list.filter((p) => !p.folded && !p.allIn);
    if (active.length === 0) return true;
    return active.every((p) => acted.includes(p.id) && p.bet >= highBet);
  };

  const markActed = (playerId: number, prev: number[]) =>
    prev.includes(playerId) ? prev : [...prev, playerId];

  const placeBet = (playerId: number) => {
    const amount = parseInt(betInput[playerId] || "0");
    if (isNaN(amount) || amount <= 0) return;
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    const toAdd = Math.max(0, amount - player.bet);
    if (toAdd <= 0) { setBetInput((prev) => ({ ...prev, [playerId]: "" })); return; }
    const actual = Math.min(toAdd, player.chips);
    const newBet = player.bet + actual;
    const newChips = player.chips - actual;
    const isAllIn = newChips === 0;
    const newHighBet = Math.max(currentHighBet, newBet);
    if (!isAllIn && currentHighBet > 0 && newBet < currentHighBet) {
      setBetInput((prev) => ({ ...prev, [playerId]: "" }));
      return;
    }
    const updated = players.map((p) =>
      p.id !== playerId ? p : { ...p, chips: newChips, bet: newBet, allIn: isAllIn }
    );
    const newContrib = { ...handContrib, [playerId]: (handContrib[playerId] ?? 0) + actual };
    const newActed = markActed(playerId, actedThisStreet);
    setCurrentHighBet(newHighBet);
    setHandContrib(newContrib);
    setBetInput((prev) => ({ ...prev, [playerId]: "" }));
    setActedThisStreet(newActed);
    if (isStreetComplete(updated, newActed, newHighBet)) {
      advanceStreetOrShowdown(updated, newContrib);
    } else {
      setPlayers(updated);
      afterAction(playerId, updated);
    }
  };

  const callBet = (playerId: number) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    const callAmount = Math.min(currentHighBet - player.bet, player.chips);
    if (callAmount <= 0) return;
    const newChips = player.chips - callAmount;
    const updated = players.map((p) =>
      p.id !== playerId ? p : { ...p, chips: newChips, bet: p.bet + callAmount, allIn: newChips === 0 }
    );
    const newContrib = { ...handContrib, [playerId]: (handContrib[playerId] ?? 0) + callAmount };
    setHandContrib(newContrib);
    const newActed = markActed(playerId, actedThisStreet);
    if (isStreetComplete(updated, newActed, currentHighBet)) {
      advanceStreetOrShowdown(updated, newContrib);
    } else {
      setPlayers(updated);
      setActedThisStreet(newActed);
      afterAction(playerId, updated);
    }
  };

  const doAllIn = (playerId: number) => {
    const player = players.find((p) => p.id === playerId);
    if (!player || player.chips === 0) return;
    const newBet = player.bet + player.chips;
    const updated = players.map((p) =>
      p.id !== playerId ? p : { ...p, chips: 0, bet: newBet, allIn: true }
    );
    const newContrib = { ...handContrib, [playerId]: (handContrib[playerId] ?? 0) + player.chips };
    const newHighBet = Math.max(currentHighBet, newBet);
    const newActed = markActed(playerId, actedThisStreet);
    setCurrentHighBet(newHighBet);
    setHandContrib(newContrib);
    setActedThisStreet(newActed);
    if (isStreetComplete(updated, newActed, newHighBet)) {
      advanceStreetOrShowdown(updated, newContrib);
    } else {
      setPlayers(updated);
      afterAction(playerId, updated);
    }
  };

  const fold = (playerId: number) => {
    const updated = players.map((p) => (p.id === playerId ? { ...p, folded: true } : p));
    const remaining = updated.filter((p) => !p.folded);
    if (remaining.length === 1) {
      autoAwardPot(remaining[0].id, updated);
      return;
    }
    const newActed = markActed(playerId, actedThisStreet);
    if (isStreetComplete(updated, newActed, currentHighBet)) {
      advanceStreetOrShowdown(updated, handContrib);
    } else {
      setPlayers(updated);
      setActedThisStreet(newActed);
      afterAction(playerId, updated);
    }
  };

  const check = (playerId: number) => {
    const newActed = markActed(playerId, actedThisStreet);
    if (isStreetComplete(players, newActed, currentHighBet)) {
      advanceStreetOrShowdown(players, handContrib);
    } else {
      setActedThisStreet(newActed);
      afterAction(playerId, players);
    }
  };

  // quick bet: set input to exact amount (capped at chips)
  const quickBet = (playerId: number, amount: number) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    setBetInput((prev) => ({ ...prev, [playerId]: String(Math.min(Math.floor(amount), player.chips)) }));
  };

  // ── Street / Showdown ─────────────────────────────────────────────

  // advance street with a given player list
  const advanceStreetWith = (list: Player[]) => {
    const totalBets = list.reduce((sum, p) => sum + p.bet, 0);
    const idx = STREETS.indexOf(street);
    if (idx < STREETS.length - 1) setStreet(STREETS[idx + 1]);
    setPot((prev) => prev + totalBets);
    const cleared = list.map((p) => ({ ...p, bet: 0 }));
    setPlayers(cleared);
    setCurrentHighBet(0);
    setActivePlayerIndex(nextActiveFrom(dealerIndex, cleared));
    setActedThisStreet([]);
  };

  const nextStreet = () => advanceStreetWith(players);

  // Advance to next street, or skip to showdown if ≤1 player can act
  const advanceStreetOrShowdown = (list: Player[], contribs: Record<number, number>) => {
    const streetIdx = STREETS.indexOf(street);
    const canAct = list.filter((p) => !p.folded && !p.allIn).length;
    if (streetIdx >= STREETS.length - 1 || canAct <= 1) {
      openShowdownWith(list, contribs);
    } else {
      advanceStreetWith(list);
    }
  };

  // open showdown with an explicit player list and contrib map (for auto-trigger)
  const openShowdownWith = (list: Player[], contrib: Record<number, number>) => {
    const totalBets = list.reduce((sum, p) => sum + p.bet, 0);
    const pots = calcSidePots(list, contrib);
    setPot((prev) => prev + totalBets);
    setPlayers(list.map((p) => ({ ...p, bet: 0 })));
    setActedThisStreet([]);
    setFrozenPots(
      pots.map((p) => ({ ...p, winnerId: null, splitMode: false, splitSelectedIds: [] }))
    );
  };

  const openShowdown = () => openShowdownWith(players, handContrib);

  // Showdown: just record winner/split selection (chips applied at finishShowdown)
  const selectFrozenPotWinner = (potIndex: number, winnerId: number) => {
    setFrozenPots((prev) =>
      prev!.map((fp, i) =>
        i === potIndex ? { ...fp, winnerId, splitMode: false, splitSelectedIds: [] } : fp
      )
    );
  };

  const toggleFrozenPotSplit = (potIndex: number) =>
    setFrozenPots((prev) =>
      prev!.map((fp, i) =>
        i === potIndex ? { ...fp, splitMode: !fp.splitMode, splitSelectedIds: [] } : fp
      )
    );

  const toggleFrozenPotSplitPlayer = (potIndex: number, playerId: number) =>
    setFrozenPots((prev) =>
      prev!.map((fp, i) => {
        if (i !== potIndex) return fp;
        const sel = fp.splitSelectedIds.includes(playerId)
          ? fp.splitSelectedIds.filter((id) => id !== playerId)
          : [...fp.splitSelectedIds, playerId];
        return { ...fp, splitSelectedIds: sel };
      })
    );

  const confirmFrozenPotSplit = (potIndex: number) => {
    const fp = frozenPots![potIndex];
    const ids = fp.splitSelectedIds;
    if (ids.length < 2) return;
    setFrozenPots((prev) =>
      prev!.map((p, i) =>
        i === potIndex ? { ...p, winnerId: ids[0], splitMode: false } : p
      )
    );
  };

  const finishShowdown = () => {
    // Apply all pot awards at once
    let updatedPlayers = [...players];
    for (const fp of frozenPots ?? []) {
      if (fp.winnerId === null) continue;
      if (fp.splitSelectedIds.length > 1) {
        const ids = fp.splitSelectedIds;
        const share = Math.floor(fp.amount / ids.length);
        const remainder = fp.amount - share * ids.length;
        updatedPlayers = updatedPlayers.map((p) => {
          if (!ids.includes(p.id)) return p;
          return { ...p, chips: p.chips + share + (ids[0] === p.id ? remainder : 0) };
        });
      } else {
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === fp.winnerId ? { ...p, chips: p.chips + fp.amount } : p
        );
      }
    }
    setFrozenPots(null);
    setPot(0);
    if (updatedPlayers.some((p) => p.chips === 0)) {
      setPlayers(updatedPlayers);
      setGameState("result");
    } else {
      startNextHand(updatedPlayers);
    }
  };

  const toggleSplitWinner = (id: number) =>
    setSplitWinnerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const splitPot = () => {
    if (splitWinnerIds.length === 0) return;
    const totalBets = players.reduce((sum, p) => sum + p.bet, 0);
    const totalPot = pot + totalBets;
    const share = Math.floor(totalPot / splitWinnerIds.length);
    const remainder = totalPot - share * splitWinnerIds.length;
    setPlayers((prev) =>
      prev.map((p) => {
        if (!splitWinnerIds.includes(p.id)) return { ...p, bet: 0 };
        return { ...p, bet: 0, chips: p.chips + share + (splitWinnerIds[0] === p.id ? remainder : 0) };
      })
    );
    setWinner(splitWinnerIds[0]);
    setPot(0);
    setGameState("result");
  };

  const doAddon = (playerId: number, amount?: number) => {
    const amt = Math.min(amount ?? rebuyAmount, rebuyAmount);
    if (amt <= 0) return;
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, chips: p.chips + amt } : p))
    );
    setTotalRebuyChips((prev) => ({ ...prev, [playerId]: (prev[playerId] ?? 0) + amt }));
  };

  // ── Next hand / Reset ─────────────────────────────────────────────
  const startNextHand = (basePlayers: Player[]) => {
    const nextDealer = rotateDealerIdx(dealerIndex, basePlayers);
    const { list, contribs, firstActive, sb, bb } = initHand(nextDealer, basePlayers);
    setDealerIndex(nextDealer);
    setPlayers(list);
    setHandContrib(contribs);
    setCurrentHighBet(bbAmount);
    setStreet("preflop");
    setPot(0);
    setWinner(null);
    setSplitWinnerIds([]);
    setSplitMode(false);
    setFrozenPots(null);
    setActivePlayerIndex(firstActive);
    setSbIdx(sb);
    setBbIdx(bb);
    setActedThisStreet([]);
    setShowSettings(false);
    setGameState("betting");
  };

  const nextHand = () => startNextHand(players);

  const endSession = () => {
    setShowEndConfirm(false);
    setFrozenPots(null);
    setPot(0);
    setGameState("ended");
  };

  const resetGame = () => {
    setGameState("setup");
    setPlayers([]);
    setPot(0);
    setWinner(null);
    setBetInput({});
    setDealerIndex(0);
    setCurrentHighBet(0);
    setHandContrib({});
    setSplitWinnerIds([]);
    setSplitMode(false);
    setFrozenPots(null);
    setSbIdx(0);
    setBbIdx(0);
    setSessionStartChips({});
    setTotalRebuyChips({});
    localStorage.removeItem(STORAGE_KEY);
  };

  // ── Derived ───────────────────────────────────────────────────────
  const streetIndex = STREETS.indexOf(street);
  const hasAllIn = players.some((p) => p.allIn && !p.folded);
  const totalCurrentPot = pot + players.reduce((sum, p) => sum + p.bet, 0);
  const liveSidePots = hasAllIn && !frozenPots ? calcSidePots(players, handContrib) : [];
  const brokePlayers = players.filter((p) => p.chips === 0);

  const activePlayer = players[activePlayerIndex];
  const activeIsActing = !!activePlayer && !activePlayer.folded && !activePlayer.allIn && !frozenPots;
  const isBbOptionActive = activeIsActing && street === "preflop" && activePlayerIndex === bbIdx;
  const activePosLabel = getPositionLabel(activePlayerIndex);

  const quickBets: { label: string; val: number }[] = (() => {
    const p3 = Math.floor(totalCurrentPot / 3);
    const p2 = Math.floor(totalCurrentPot / 2);
    const p34 = Math.floor(totalCurrentPot * 3 / 4);
    const b25 = Math.floor(currentHighBet * 2.5);
    const b4 = currentHighBet * 4;
    if (street === "preflop" && currentHighBet <= bbAmount) {
      return [
        { label: `2.5BB (${Math.floor(bbAmount * 2.5)})`, val: Math.floor(bbAmount * 2.5) },
        { label: `3BB (${bbAmount * 3})`, val: bbAmount * 3 },
      ];
    } else if (currentHighBet === 0) {
      return [
        { label: `1/3P (${p3})`, val: p3 },
        { label: `1/2P (${p2})`, val: p2 },
        { label: `3/4P (${p34})`, val: p34 },
        { label: `1P (${totalCurrentPot})`, val: totalCurrentPot },
      ];
    } else {
      return [
        { label: `×2.5 (${b25})`, val: b25 },
        { label: `×4 (${b4})`, val: b4 },
      ];
    }
  })();

  // ── Render ────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen text-white" style={{ background: "#0d3320" }}>
      <h1 className="text-2xl font-bold text-center text-yellow-400 py-3 tracking-wide">
        Poker Chip Manager
      </h1>

      {/* ===== SETUP ===== */}
      {gameState === "setup" && (
        <div className="max-w-md mx-auto px-4 space-y-4 pb-8">
          <div className="bg-green-800 rounded-xl p-4 space-y-3">
            <h2 className="text-xl font-semibold">ゲーム設定</h2>
            {[
              { label: "初期チップ", value: startingChips, set: setStartingChips },
              { label: "SB", value: sbAmount, set: setSbAmount },
              { label: "BB", value: bbAmount, set: setBbAmount },
              { label: "リバイ上限", value: rebuyAmount, set: setRebuyAmount },
            ].map(({ label, value, set }) => (
              <div key={label} className="flex items-center gap-2">
                <label className="text-sm whitespace-nowrap w-24">{label}</label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  className="flex-1 bg-green-700 rounded px-3 py-1 text-right"
                />
              </div>
            ))}
          </div>

          <div className="bg-green-800 rounded-xl p-4 space-y-3">
            <h2 className="text-xl font-semibold">プレイヤー追加</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="名前を入力"
                value={newPlayerName}
                onChange={(e) => { setNewPlayerName(e.target.value); setNameError(""); }}
                onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                className="flex-1 bg-green-700 rounded px-3 py-2"
              />
              <button
                onClick={addPlayer}
                disabled={players.length >= 9}
                className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-bold px-4 rounded"
              >
                追加
              </button>
            </div>
            {nameError && <p className="text-red-400 text-xs">{nameError}</p>}
            <ul className="space-y-2">
              {players.map((p) => (
                <li key={p.id} className="flex justify-between items-center bg-green-700 rounded px-3 py-2">
                  <span>{p.name}</span>
                  <span className="text-yellow-300 text-sm">{p.chips} chips</span>
                  <button onClick={() => removePlayer(p.id)} className="text-red-400 hover:text-red-300 text-sm ml-2">
                    削除
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={startGame}
            disabled={players.length < 2}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-bold py-3 rounded-xl text-lg"
          >
            ゲーム開始 ({players.length}/9人)
          </button>
        </div>
      )}

      {/* ===== BETTING ===== */}
      {gameState === "betting" && (
        <div className="max-w-lg mx-auto px-2 space-y-3 pb-6">

          {/* Settings panel */}
          <div className="bg-green-900 rounded-xl overflow-hidden border border-green-700">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="w-full flex justify-between items-center px-4 py-2 text-sm text-green-400 hover:text-white"
            >
              <span>⚙ ゲーム設定</span>
              <span>{showSettings ? "▲" : "▼"}</span>
            </button>
            {showSettings && (
              <div className="px-4 pb-4 space-y-2 border-t border-green-700 pt-3">
                {[
                  { label: "SB", value: sbAmount, set: setSbAmount },
                  { label: "BB", value: bbAmount, set: setBbAmount },
                  { label: "リバイ上限", value: rebuyAmount, set: setRebuyAmount },
                ].map(({ label, value, set }) => (
                  <div key={label} className="flex items-center gap-2">
                    <label className="text-sm whitespace-nowrap w-20">{label}</label>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => set(Number(e.target.value))}
                      className="flex-1 bg-green-700 rounded px-3 py-1 text-right"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Poker Table ── */}
          <div className="relative w-full rounded-2xl" style={{ height: 430, background: "#0a2a14" }}>

            {/* Felt oval */}
            <div className="absolute" style={{
              width: "60%", height: "58%",
              left: "50%", top: "50%",
              transform: "translate(-50%, -50%)",
              background: "radial-gradient(ellipse at 40% 35%, #16a34a 0%, #166534 55%, #14532d 100%)",
              borderRadius: "50%",
              border: "7px solid #78350f",
              boxShadow: "inset 0 0 30px rgba(0,0,0,0.5), 0 6px 28px rgba(0,0,0,0.7)",
              zIndex: 1,
            }}>
              {/* Street progress inside table */}
              <div className="absolute flex gap-0.5" style={{ top: 8, left: 8, right: 8 }}>
                {STREETS.map((s, i) => (
                  <div key={s} className={`flex-1 text-center font-bold rounded ${
                    i === streetIndex ? "bg-yellow-500 text-black" :
                    i < streetIndex ? "bg-green-700 text-green-400" :
                    "bg-green-950 text-green-700"
                  }`} style={{ fontSize: 8, padding: "2px 0" }}>
                    {s === "preflop" ? "Pre" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </div>
                ))}
              </div>

              {/* Pot display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-green-300 font-semibold tracking-widest" style={{ fontSize: 9 }}>POT</div>
                <div className="text-yellow-400 font-bold leading-none" style={{ fontSize: 28 }}>{totalCurrentPot}</div>
                {currentHighBet > 0 && (
                  <div className="text-blue-300 mt-0.5" style={{ fontSize: 9 }}>Bet: {currentHighBet}</div>
                )}
                {liveSidePots.length > 1 && liveSidePots.map((sp, i) => (
                  <div key={i} className="text-orange-300" style={{ fontSize: 8 }}>
                    Pot{i + 1}: {sp.amount}
                  </div>
                ))}
              </div>
            </div>

            {/* Player seats around the table */}
            {players.map((p, playerIndex) => {
              const n = players.length;
              const angle = (playerIndex / n) * Math.PI * 2;
              const rx = 34, ry = 36;
              const x = 50 - rx * Math.sin(angle);
              const y = 50 + ry * Math.cos(angle);

              const pos = getPositionLabel(playerIndex);
              const isDealer = playerIndex === dealerIndex && p.chips > 0;
              const isActive = playerIndex === activePlayerIndex && !p.folded && !p.allIn && !frozenPots;
              const chipDelta = p.chips - (sessionStartChips[p.id] ?? p.chips) - (totalRebuyChips[p.id] ?? 0);
              const deltaStr = chipDelta > 0 ? `+${chipDelta}` : `${chipDelta}`;
              const deltaColor = chipDelta > 0 ? "#4ade80" : chipDelta < 0 ? "#f87171" : "#9ca3af";

              let cardBg = "#1f4a2a";
              let borderStyle = "1px solid #2d6a3a";
              let shadow = "";
              if (p.folded) { cardBg = "#374151"; borderStyle = "1px solid #4b5563"; }
              else if (p.allIn) { borderStyle = "2px solid #f97316"; }
              else if (isActive) { cardBg = "#166534"; borderStyle = "2px solid #facc15"; shadow = "0 0 14px rgba(250,204,21,0.6)"; }

              return (
                <div key={p.id} style={{
                  position: "absolute",
                  left: `${x}%`, top: `${y}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: isActive ? 10 : 3,
                  display: "flex", flexDirection: "column", alignItems: "center",
                }}>
                  {/* Status label above seat */}
                  {isActive && (
                    <div className="animate-pulse font-bold" style={{ fontSize: 8, color: "#facc15", marginBottom: 2, whiteSpace: "nowrap" }}>
                      {isBbOptionActive ? "BB OPTION" : "YOUR TURN"}
                    </div>
                  )}

                  <div style={{
                    width: 80, background: cardBg, borderRadius: 10, padding: "8px 6px",
                    border: borderStyle, boxShadow: shadow,
                    opacity: p.folded ? 0.5 : 1, textAlign: "center",
                  }}>
                    {/* Name */}
                    <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: p.folded ? "#9ca3af" : "white" }}>
                      {p.name}
                    </div>

                    {/* Badges row */}
                    <div style={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap", marginTop: 2 }}>
                      {isDealer && (
                        <span style={{ fontSize: 8, background: "#eab308", color: "black", borderRadius: "50%", padding: "0 4px", fontWeight: 700 }}>D</span>
                      )}
                      {pos === "SB" || pos === "BTN/SB" ? (
                        <span style={{ fontSize: 8, background: "#ea580c", borderRadius: 3, padding: "0 3px", fontWeight: 700 }}>SB</span>
                      ) : null}
                      {pos === "BB" ? (
                        <span style={{ fontSize: 8, background: "#b91c1c", borderRadius: 3, padding: "0 3px", fontWeight: 700 }}>BB</span>
                      ) : null}
                    </div>

                    {/* Status */}
                    {p.folded && <div style={{ fontSize: 9, color: "#9ca3af" }}>FOLD</div>}
                    {p.allIn && <div style={{ fontSize: 9, color: "#fb923c", fontWeight: 700 }}>ALL-IN</div>}

                    {/* Chips + delta */}
                    <div style={{ fontSize: 11, color: "#fde047", fontFamily: "monospace", marginTop: 2 }}>{p.chips}</div>
                    {sessionStartChips[p.id] !== undefined && chipDelta !== 0 && (
                      <div style={{ fontSize: 9, color: deltaColor, fontFamily: "monospace" }}>{deltaStr}</div>
                    )}

                    {/* Bet */}
                    {p.bet > 0 && (
                      <div style={{ fontSize: 9, color: "#93c5fd", marginTop: 1 }}>bet:{p.bet}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Showdown pot assignment */}
          {frozenPots && (
            <div className="bg-green-900 border border-green-700 rounded-xl p-3 space-y-2">
              <div className="text-sm font-bold text-orange-300">Showdown — ポットを付与</div>
              {frozenPots.map((fp, i) => {
                const isSplit = fp.splitSelectedIds.length > 1 && fp.winnerId !== null;
                return (
                  <div key={i} className="bg-green-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-green-400">Pot {i + 1}</span>
                      <span className="text-yellow-300 font-bold text-lg">{fp.amount}</span>
                      {fp.winnerId !== null && (
                        <span className="text-xs text-green-300">
                          {isSplit
                            ? fp.splitSelectedIds.map((id) => players.find((p) => p.id === id)?.name).join(" / ") + " で分割"
                            : "→ " + players.find((p) => p.id === fp.winnerId)?.name}
                        </span>
                      )}
                    </div>

                    {!fp.splitMode && (
                      <div className="flex flex-wrap gap-1.5">
                        {fp.eligibleIds.map((id) => {
                          const isSelected = fp.winnerId === id && !isSplit;
                          return (
                            <button key={id} onClick={() => selectFrozenPotWinner(i, id)}
                              className={`text-sm px-3 py-1.5 rounded font-bold transition-all ${
                                isSelected
                                  ? "bg-yellow-400 text-black ring-2 ring-yellow-200 shadow-lg scale-105"
                                  : "bg-green-700 hover:bg-green-600 text-white"
                              }`}>
                              {isSelected ? "✓ " : ""}{players.find((p) => p.id === id)?.name}
                            </button>
                          );
                        })}
                        {fp.eligibleIds.length >= 2 && (
                          <button onClick={() => toggleFrozenPotSplit(i)}
                            className={`text-sm px-3 py-1.5 rounded font-bold transition-all ${
                              isSplit ? "bg-purple-400 text-black ring-2 ring-purple-200 scale-105" : "bg-purple-800 hover:bg-purple-700"
                            }`}>
                            Split
                          </button>
                        )}
                      </div>
                    )}

                    {fp.splitMode && (
                      <div className="space-y-1.5">
                        <div className="text-xs text-purple-300">分割するプレイヤーを選択</div>
                        <div className="flex flex-wrap gap-1.5">
                          {fp.eligibleIds.map((id) => {
                            const isSel = fp.splitSelectedIds.includes(id);
                            return (
                              <button key={id} onClick={() => toggleFrozenPotSplitPlayer(i, id)}
                                className={`text-sm px-3 py-1.5 rounded font-bold transition-all ${
                                  isSel ? "bg-purple-400 text-black ring-2 ring-purple-200 scale-105" : "bg-green-700 hover:bg-green-600"
                                }`}>
                                {isSel ? "✓ " : ""}{players.find((p) => p.id === id)?.name}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex gap-1.5">
                          {fp.splitSelectedIds.length >= 2 && (
                            <button onClick={() => confirmFrozenPotSplit(i)}
                              className="text-xs bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded font-bold">
                              {fp.splitSelectedIds.length}人で分割
                            </button>
                          )}
                          <button onClick={() => toggleFrozenPotSplit(i)}
                            className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">
                            キャンセル
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {frozenPots.every((fp) => fp.winnerId !== null) && (
                <button onClick={finishShowdown}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-lg text-base">
                  次のハンドへ
                </button>
              )}
            </div>
          )}

          {/* Active player action panel */}
          {activeIsActing && (
            <div className="bg-green-900 border border-green-700 rounded-xl p-3 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold animate-pulse ${isBbOptionActive ? "text-amber-300" : "text-yellow-400"}`}>
                  {isBbOptionActive ? "BB OPTION" : "YOUR TURN"}
                </span>
                <span className="font-bold">{activePlayer.name}</span>
                {activePosLabel && (
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                    activePosLabel.includes("BTN") ? "bg-yellow-600 text-black" :
                    activePosLabel === "SB" ? "bg-orange-600" : "bg-red-700"
                  }`}>{activePosLabel}</span>
                )}
                <span className="ml-auto text-yellow-300 text-sm font-mono">{activePlayer.chips} chips</span>
              </div>
              {activePlayer.bet > 0 && (
                <div className="text-xs text-blue-300">ベット中: {activePlayer.bet}</div>
              )}

              {/* Quick bets */}
              <div className="flex gap-1 flex-wrap items-center">
                <span className="text-xs text-green-400">クイック:</span>
                {quickBets.map(({ label, val }) => (
                  <button key={label} onClick={() => quickBet(activePlayer.id, val)}
                    className="text-xs bg-green-800 hover:bg-green-700 border border-green-600 px-2 py-0.5 rounded">
                    {label}
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-1.5 flex-wrap">
                <input
                  type="number"
                  placeholder="合計ベット額"
                  value={betInput[activePlayer.id] || ""}
                  onChange={(e) => setBetInput((prev) => ({ ...prev, [activePlayer.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && placeBet(activePlayer.id)}
                  className="flex-1 min-w-0 bg-green-800 border border-green-600 rounded px-3 py-1.5 text-right"
                />
                <button onClick={() => placeBet(activePlayer.id)}
                  className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded font-bold text-sm">
                  {(street === "preflop" ? currentHighBet > bbAmount : currentHighBet > 0) ? "RAISE" : "BET"}
                </button>
                {(() => {
                  const callAmount = Math.min(currentHighBet - activePlayer.bet, activePlayer.chips);
                  return callAmount > 0 ? (
                    <button onClick={() => callBet(activePlayer.id)}
                      className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded font-bold text-sm">
                      CALL {callAmount}
                    </button>
                  ) : (
                    <button onClick={() => check(activePlayer.id)}
                      className="bg-green-800 hover:bg-green-700 border border-green-600 px-3 py-1.5 rounded font-bold text-sm">
                      CHECK
                    </button>
                  );
                })()}
                <button onClick={() => doAllIn(activePlayer.id)}
                  className="bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded font-bold text-sm">
                  ALL-IN
                </button>
                <button onClick={() => fold(activePlayer.id)}
                  className="bg-red-700 hover:bg-red-600 px-3 py-1.5 rounded font-bold text-sm">
                  FOLD
                </button>
              </div>
            </div>
          )}

          {/* Session end */}
          {showEndConfirm ? (
            <div className="bg-gray-900 border border-gray-600 rounded-xl p-4 space-y-3">
              <p className="text-sm text-center text-gray-300">セッションを終了してチップ増減の結果を表示しますか？</p>
              <div className="flex gap-3">
                <button onClick={endSession} className="flex-1 bg-red-700 hover:bg-red-600 font-bold py-2 rounded-lg">
                  終了する
                </button>
                <button onClick={() => setShowEndConfirm(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg">
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowEndConfirm(true)} className="w-full text-sm text-gray-500 hover:text-gray-300 py-2">
              セッションを終了
            </button>
          )}
        </div>
      )}

      {/* ===== RESULT ===== */}
      {gameState === "result" && (
        <div className="max-w-md mx-auto px-4 space-y-4 pb-8">

          {/* Chip standings */}
          <div className="bg-green-900 border border-green-700 rounded-xl p-4 space-y-2">
            <h2 className="font-semibold text-lg text-yellow-300">チップ状況</h2>
            {[...players].sort((a, b) => b.chips - a.chips).map((p) => {
              const delta = p.chips - (sessionStartChips[p.id] ?? p.chips) - (totalRebuyChips[p.id] ?? 0);
              const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
              const deltaColor = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-gray-400";
              const rebuyNote = (totalRebuyChips[p.id] ?? 0) > 0 ? ` (リバイ+${totalRebuyChips[p.id]})` : "";
              return (
                <div key={p.id} className="flex justify-between items-center bg-green-800 rounded px-3 py-2">
                  <span className={p.chips === 0 ? "text-gray-400" : ""}>{p.name}</span>
                  <div className="text-right">
                    <span className="text-yellow-300 font-mono">{p.chips} chips</span>
                    {sessionStartChips[p.id] !== undefined && (
                      <span className={`text-sm font-mono ml-2 ${deltaColor}`}>({deltaStr}{rebuyNote})</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rebuy for broke players */}
          {brokePlayers.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
              <h2 className="font-semibold text-lg text-red-300">リバイ</h2>
              {brokePlayers.map((p) => {
                const inputKey = `rebuy-${p.id}`;
                return (
                  <div key={p.id} className="space-y-1.5">
                    <div className="text-sm font-bold text-white">{p.name}</div>
                    <div className="flex gap-2 items-center">
                      <input
                        id={inputKey}
                        type="number"
                        min={0}
                        max={rebuyAmount}
                        defaultValue={rebuyAmount}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-right text-white"
                      />
                      <span className="text-xs text-gray-400 whitespace-nowrap">/ {rebuyAmount}</span>
                      <button
                        onClick={() => {
                          const el = document.getElementById(inputKey) as HTMLInputElement | null;
                          const val = Math.min(Math.max(0, parseInt(el?.value || "0") || 0), rebuyAmount);
                          doAddon(p.id, val);
                          if (el) el.value = String(rebuyAmount);
                        }}
                        className="bg-blue-600 hover:bg-blue-500 font-bold px-4 py-1.5 rounded whitespace-nowrap"
                      >
                        リバイ
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={nextHand}
              className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-xl">
              次のハンドへ
            </button>
          </div>

          {/* Session end */}
          {showEndConfirm ? (
            <div className="bg-gray-900 border border-gray-600 rounded-xl p-4 space-y-3">
              <p className="text-sm text-center text-gray-300">セッションを終了してチップ増減の結果を表示しますか？</p>
              <div className="flex gap-3">
                <button onClick={endSession} className="flex-1 bg-red-700 hover:bg-red-600 font-bold py-2 rounded-lg">
                  終了する
                </button>
                <button onClick={() => setShowEndConfirm(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg">
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowEndConfirm(true)} className="w-full text-sm text-gray-500 hover:text-gray-300 py-2">
              セッションを終了
            </button>
          )}
        </div>
      )}

      {/* ===== ENDED ===== */}
      {gameState === "ended" && (
        <div className="max-w-md mx-auto px-4 space-y-4 pb-8">
          <h2 className="text-xl font-bold text-center text-yellow-300 py-2">セッション終了</h2>

          <div className="bg-green-900 border border-green-700 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-yellow-300 mb-3">最終結果</h3>
            {[...players].sort((a, b) => b.chips - a.chips).map((p, rank) => {
              const delta = p.chips - (sessionStartChips[p.id] ?? p.chips) - (totalRebuyChips[p.id] ?? 0);
              const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
              const deltaColor = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-gray-400";
              const rebuyNote = (totalRebuyChips[p.id] ?? 0) > 0 ? ` (リバイ +${totalRebuyChips[p.id]})` : "";
              return (
                <div key={p.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                  rank === 0 ? "bg-yellow-900/40 border border-yellow-700/60" : "bg-green-800"
                }`}>
                  <span className="text-base font-bold text-gray-400 w-6 text-center">{rank + 1}</span>
                  <span className="flex-1 font-bold">{p.name}</span>
                  <div className="text-right">
                    <div className="text-yellow-300 font-mono text-sm">{p.chips} chips</div>
                    <div className={`text-sm font-bold font-mono ${deltaColor}`}>
                      {deltaStr}{rebuyNote}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={resetGame}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-xl text-lg">
            新しいゲームを始める
          </button>
        </div>
      )}
    </main>
  );
}

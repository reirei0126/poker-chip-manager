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

type GameState = "setup" | "betting" | "result";
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
  const sorted = [...playerList]
    .filter((p) => (contribs[p.id] ?? 0) > 0)
    .sort((a, b) => (contribs[a.id] ?? 0) - (contribs[b.id] ?? 0));
  const pots: { amount: number; eligibleIds: number[] }[] = [];
  let prevCap = 0;
  for (const player of sorted) {
    const cap = contribs[player.id] ?? 0;
    if (cap <= prevCap) continue;
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
  const [sbAmount, setSbAmount] = useState(10);
  const [bbAmount, setBbAmount] = useState(20);
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
        setSbAmount(s.sbAmount ?? 10);
        setBbAmount(s.bbAmount ?? 20);
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
        })
      );
    } catch {}
  }, [loaded, gameState, players, startingChips, sbAmount, bbAmount, pot, winner,
    street, dealerIndex, currentHighBet, activePlayerIndex, handContrib,
    frozenPots, sbIdx, bbIdx, rebuyAmount, actedThisStreet]);

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
    if (!newPlayerName.trim()) return;
    setPlayers((prev) => [
      ...prev,
      { id: Date.now(), name: newPlayerName.trim(), chips: startingChips, bet: 0, folded: false, allIn: false },
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
    setPlayers(updatedPlayers.map((p) =>
      p.id === winnerId ? { ...p, chips: p.chips + totalPot, bet: 0 } : { ...p, bet: 0 }
    ));
    setWinner(winnerId);
    setPot(0);
    setGameState("result");
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
    const actual = Math.min(amount, player.chips);
    const newBet = player.bet + actual;
    const newChips = player.chips - actual;
    const isAllIn = newChips === 0;
    if (!isAllIn && currentHighBet > 0 && newBet < currentHighBet) {
      setBetInput((prev) => ({ ...prev, [playerId]: "" }));
      return;
    }
    const updated = players.map((p) =>
      p.id !== playerId ? p : { ...p, chips: newChips, bet: newBet, allIn: isAllIn }
    );
    setPlayers(updated);
    setCurrentHighBet((prev) => Math.max(prev, newBet));
    addContrib(playerId, actual);
    setBetInput((prev) => ({ ...prev, [playerId]: "" }));
    setActedThisStreet((prev) => markActed(playerId, prev));
    afterAction(playerId, updated);
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
    addContrib(playerId, callAmount);
    const newActed = markActed(playerId, actedThisStreet);
    const streetIdx = STREETS.indexOf(street);
    if (isStreetComplete(updated, newActed, currentHighBet) && streetIdx < STREETS.length - 1) {
      advanceStreetWith(updated);
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
    setPlayers(updated);
    setCurrentHighBet((prev) => Math.max(prev, newBet));
    addContrib(playerId, player.chips);
    setActedThisStreet((prev) => markActed(playerId, prev));
    afterAction(playerId, updated);
  };

  const fold = (playerId: number) => {
    const updated = players.map((p) => (p.id === playerId ? { ...p, folded: true } : p));
    const remaining = updated.filter((p) => !p.folded);
    if (remaining.length === 1) {
      autoAwardPot(remaining[0].id, updated);
      return;
    }
    const newActed = markActed(playerId, actedThisStreet);
    const streetIdx = STREETS.indexOf(street);
    if (isStreetComplete(updated, newActed, currentHighBet) && streetIdx < STREETS.length - 1) {
      advanceStreetWith(updated);
    } else {
      setPlayers(updated);
      setActedThisStreet(newActed);
      afterAction(playerId, updated);
    }
  };

  const check = (playerId: number) => {
    const newActed = markActed(playerId, actedThisStreet);
    const streetIdx = STREETS.indexOf(street);
    if (isStreetComplete(players, newActed, currentHighBet) && streetIdx < STREETS.length - 1) {
      advanceStreetWith(players);
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

  // advance street with a given player list (used by auto-advance and manual button)
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

  const openShowdown = () => {
    const totalBets = players.reduce((sum, p) => sum + p.bet, 0);
    const pots = calcSidePots(players, handContrib);
    setPot((prev) => prev + totalBets);
    setPlayers((prev) => prev.map((p) => ({ ...p, bet: 0 })));
    setFrozenPots(
      pots.map((p) => ({ ...p, winnerId: null, splitMode: false, splitSelectedIds: [] }))
    );
  };

  // Fix 7: per-pot split in showdown
  const awardFrozenPot = (potIndex: number, winnerId: number) => {
    const fp = frozenPots![potIndex];
    setPlayers((prev) =>
      prev.map((p) => (p.id === winnerId ? { ...p, chips: p.chips + fp.amount } : p))
    );
    const updated = frozenPots!.map((p, i) =>
      i === potIndex ? { ...p, winnerId, splitMode: false } : p
    );
    setFrozenPots(updated);
    if (updated.every((p) => p.winnerId !== null)) setWinner(winnerId);
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
    const share = Math.floor(fp.amount / ids.length);
    const remainder = fp.amount - share * ids.length;
    setPlayers((prev) =>
      prev.map((p) => {
        if (!ids.includes(p.id)) return p;
        return { ...p, chips: p.chips + share + (ids[0] === p.id ? remainder : 0) };
      })
    );
    const updated = frozenPots!.map((p, i) =>
      i === potIndex ? { ...p, winnerId: ids[0], splitMode: false } : p
    );
    setFrozenPots(updated);
    if (updated.every((p) => p.winnerId !== null)) setWinner(ids[0]);
  };

  const finishShowdown = () => { setPot(0); setGameState("result"); };

  // ── Simple award (no all-in) ──────────────────────────────────────
  const awardPot = (winnerId: number) => {
    const totalBets = players.reduce((sum, p) => sum + p.bet, 0);
    const totalPot = pot + totalBets;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === winnerId ? { ...p, chips: p.chips + totalPot, bet: 0 } : { ...p, bet: 0 }
      )
    );
    setWinner(winnerId);
    setPot(0);
    setGameState("result");
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

  const doAddon = (playerId: number) =>
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, chips: p.chips + rebuyAmount } : p))
    );

  // ── Next hand / Reset ─────────────────────────────────────────────
  const nextHand = () => {
    // Fix 2: rotate dealer only among players with chips
    const nextDealer = rotateDealerIdx(dealerIndex, players);
    const { list, contribs, firstActive, sb, bb } = initHand(nextDealer, players);
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
    setGameState("betting");
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
    localStorage.removeItem(STORAGE_KEY);
  };

  // ── Derived ───────────────────────────────────────────────────────
  const streetIndex = STREETS.indexOf(street);
  const hasAllIn = players.some((p) => p.allIn && !p.folded);
  const totalCurrentPot = pot + players.reduce((sum, p) => sum + p.bet, 0);
  const liveSidePots = hasAllIn && !frozenPots ? calcSidePots(players, handContrib) : [];
  const brokePlayers = players.filter((p) => p.chips === 0);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-green-900 text-white p-4">
      <h1 className="text-3xl font-bold text-center text-yellow-400 mb-6">
        Poker Chip Manager
      </h1>

      {/* ===== SETUP ===== */}
      {gameState === "setup" && (
        <div className="max-w-md mx-auto space-y-4">
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
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                className="flex-1 bg-green-700 rounded px-3 py-2"
              />
              <button
                onClick={addPlayer}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 rounded"
              >
                追加
              </button>
            </div>
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
            ゲーム開始 ({players.length}人)
          </button>
        </div>
      )}

      {/* ===== BETTING ===== */}
      {gameState === "betting" && (
        <div className="max-w-lg mx-auto space-y-4">

          {/* Street + Pot */}
          <div className="bg-green-800 rounded-xl p-4">
            <div className="flex gap-1 mb-3">
              {STREETS.map((s, i) => (
                <div
                  key={s}
                  className={`flex-1 text-center text-xs py-1 rounded font-bold ${
                    i === streetIndex
                      ? "bg-yellow-500 text-black"
                      : i < streetIndex
                      ? "bg-green-600 text-green-300"
                      : "bg-green-700 text-green-500"
                  }`}
                >
                  {STREET_LABELS[s]}
                </div>
              ))}
            </div>

            <div className="text-center">
              <div className="text-sm text-green-300">ポット</div>
              <div className="text-4xl font-bold text-yellow-400">{totalCurrentPot}</div>
              {currentHighBet > 0 && (
                <div className="text-sm text-blue-300 mt-1">現在のベット: {currentHighBet}</div>
              )}
            </div>

            {/* Live side pot preview */}
            {liveSidePots.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-xs text-orange-300 font-bold">サイドポット試算</div>
                {liveSidePots.map((sp, i) => (
                  <div key={i} className="text-xs bg-green-700 rounded px-2 py-1 flex justify-between">
                    <span className="text-yellow-300">Pot {i + 1}: {sp.amount}</span>
                    <span className="text-green-300">
                      {sp.eligibleIds.map((id) => players.find((p) => p.id === id)?.name).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Showdown frozen pots */}
            {frozenPots && (
              <div className="mt-3 space-y-2">
                <div className="text-sm font-bold text-orange-300">Showdown — ポットを付与</div>
                {frozenPots.map((fp, i) => (
                  <div key={i} className="bg-green-700 rounded p-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Pot {i + 1}: <span className="text-yellow-300 font-bold">{fp.amount}</span></span>
                      {fp.winnerId !== null && (
                        <span className="text-green-300">
                          → {fp.splitSelectedIds.length > 1
                            ? "Split"
                            : players.find((p) => p.id === fp.winnerId)?.name}
                        </span>
                      )}
                    </div>
                    {fp.winnerId === null && !fp.splitMode && (
                      <div className="flex flex-wrap gap-1">
                        {fp.eligibleIds.map((id) => (
                          <button
                            key={id}
                            onClick={() => awardFrozenPot(i, id)}
                            className="text-xs bg-yellow-600 hover:bg-yellow-500 text-black font-bold px-2 py-1 rounded"
                          >
                            {players.find((p) => p.id === id)?.name}
                          </button>
                        ))}
                        {fp.eligibleIds.length >= 2 && (
                          <button
                            onClick={() => toggleFrozenPotSplit(i)}
                            className="text-xs bg-purple-600 hover:bg-purple-500 px-2 py-1 rounded font-bold"
                          >
                            Split
                          </button>
                        )}
                      </div>
                    )}
                    {fp.winnerId === null && fp.splitMode && (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {fp.eligibleIds.map((id) => (
                            <button
                              key={id}
                              onClick={() => toggleFrozenPotSplitPlayer(i, id)}
                              className={`text-xs px-2 py-1 rounded font-bold ${
                                fp.splitSelectedIds.includes(id)
                                  ? "bg-purple-500"
                                  : "bg-green-600 hover:bg-green-500"
                              }`}
                            >
                              {players.find((p) => p.id === id)?.name}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          {fp.splitSelectedIds.length >= 2 && (
                            <button
                              onClick={() => confirmFrozenPotSplit(i)}
                              className="text-xs bg-purple-500 hover:bg-purple-400 px-3 py-1 rounded font-bold"
                            >
                              {fp.splitSelectedIds.length}人で分割
                            </button>
                          )}
                          <button
                            onClick={() => toggleFrozenPotSplit(i)}
                            className="text-xs bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {frozenPots.every((fp) => fp.winnerId !== null) && (
                  <button
                    onClick={finishShowdown}
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2 rounded"
                  >
                    結果を見る
                  </button>
                )}
              </div>
            )}

            {/* Street navigation */}
            {!frozenPots && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={nextStreet}
                  disabled={streetIndex === STREETS.length - 1}
                  className="flex-1 text-sm bg-blue-700 hover:bg-blue-600 disabled:opacity-40 py-2 rounded font-bold"
                >
                  {streetIndex < STREETS.length - 1
                    ? `→ ${STREET_LABELS[STREETS[streetIndex + 1]]}`
                    : "River (最終)"}
                </button>
                <button
                  onClick={openShowdown}
                  className="flex-1 text-sm bg-orange-600 hover:bg-orange-500 py-2 rounded font-bold"
                >
                  Showdown
                </button>
              </div>
            )}
          </div>

          {/* Player cards */}
          <div className="space-y-3">
            {players.map((p, playerIndex) => {
              const position = getPositionLabel(playerIndex);
              const callAmount = Math.min(currentHighBet - p.bet, p.chips);
              const isActive = playerIndex === activePlayerIndex && !p.folded && !p.allIn && !frozenPots;

              // Fix 6: BB option indicator
              const isBbOption = street === "preflop" && playerIndex === bbIdx && isActive;

              return (
                <div
                  key={p.id}
                  className={`rounded-xl p-4 space-y-2 transition-all ${
                    p.folded
                      ? "bg-gray-700 opacity-50"
                      : p.allIn
                      ? "bg-green-900 border border-orange-500"
                      : isActive
                      ? "bg-green-800 ring-2 ring-yellow-400"
                      : "bg-green-800"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isActive && !isBbOption && (
                        <span className="text-yellow-400 text-xs font-bold animate-pulse">YOUR TURN</span>
                      )}
                      {isBbOption && (
                        <span className="text-amber-300 text-xs font-bold animate-pulse">BB OPTION</span>
                      )}
                      <span className="font-bold text-lg">
                        {p.folded ? "FOLD " : p.allIn ? "ALL-IN " : ""}
                        {p.name}
                      </span>
                      {position && (
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                          position.includes("BTN") ? "bg-yellow-600" :
                          position === "SB" ? "bg-orange-600" : "bg-red-700"
                        }`}>
                          {position}
                        </span>
                      )}
                    </div>
                    <span className="text-yellow-300 font-mono">{p.chips} chips</span>
                  </div>

                  {p.bet > 0 && <div className="text-sm text-blue-300">ベット中: {p.bet}</div>}

                  {isActive && (
                    <>
                      <div className="flex gap-1 flex-wrap items-center">
                        <span className="text-xs text-green-400">クイック:</span>
                        {[
                          { label: `BB×2 (${bbAmount * 2})`, val: bbAmount * 2 },
                          { label: `BB×3 (${bbAmount * 3})`, val: bbAmount * 3 },
                          { label: `½Pot (${Math.floor(totalCurrentPot / 2)})`, val: Math.floor(totalCurrentPot / 2) },
                          { label: `1Pot (${totalCurrentPot})`, val: totalCurrentPot },
                        ].map(({ label, val }) => (
                          <button
                            key={label}
                            onClick={() => quickBet(p.id, val)}
                            className="text-xs bg-green-700 hover:bg-green-600 px-2 py-0.5 rounded"
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <input
                          type="number"
                          placeholder="ベット額"
                          value={betInput[p.id] || ""}
                          onChange={(e) =>
                            setBetInput((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          onKeyDown={(e) => e.key === "Enter" && placeBet(p.id)}
                          className="flex-1 min-w-0 bg-green-700 rounded px-3 py-1 text-right"
                        />
                        <button onClick={() => placeBet(p.id)} className="bg-blue-500 hover:bg-blue-400 px-3 py-1 rounded font-bold text-sm">
                          BET
                        </button>
                        {callAmount > 0 ? (
                          <button onClick={() => callBet(p.id)} className="bg-green-500 hover:bg-green-400 px-3 py-1 rounded font-bold text-sm">
                            CALL {callAmount}
                          </button>
                        ) : (
                          <button onClick={() => check(p.id)} className="bg-green-700 hover:bg-green-600 px-3 py-1 rounded font-bold text-sm">
                            CHECK
                          </button>
                        )}
                        <button onClick={() => doAllIn(p.id)} className="bg-orange-500 hover:bg-orange-400 px-3 py-1 rounded font-bold text-sm">
                          ALL-IN
                        </button>
                        <button onClick={() => fold(p.id)} className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded font-bold text-sm">
                          FOLD
                        </button>
                      </div>
                    </>
                  )}

                  {/* Award button (no all-in, no showdown) */}
                  {!p.folded && !frozenPots && !hasAllIn && (
                    <div className="pt-1">
                      {splitMode ? (
                        <button
                          onClick={() => toggleSplitWinner(p.id)}
                          className={`w-full py-1 rounded text-sm font-bold ${
                            splitWinnerIds.includes(p.id)
                              ? "bg-purple-500 hover:bg-purple-400"
                              : "bg-green-700 hover:bg-green-600 text-green-300"
                          }`}
                        >
                          {splitWinnerIds.includes(p.id) ? "✓ " : ""}勝者候補: {p.name}
                        </button>
                      ) : (
                        <button
                          onClick={() => awardPot(p.id)}
                          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-1 rounded text-sm"
                        >
                          勝者: {p.name} にポットを付与
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Split pot controls */}
          {!frozenPots && !hasAllIn && (
            <div className="flex gap-2">
              <button
                onClick={() => { setSplitMode((v) => !v); setSplitWinnerIds([]); }}
                className={`flex-1 py-2 rounded font-bold text-sm ${
                  splitMode ? "bg-purple-600 hover:bg-purple-500" : "bg-green-700 hover:bg-green-600"
                }`}
              >
                {splitMode ? "Split Mode: ON" : "Split (引き分け)"}
              </button>
              {splitMode && splitWinnerIds.length >= 2 && (
                <button
                  onClick={splitPot}
                  className="flex-1 bg-purple-500 hover:bg-purple-400 font-bold py-2 rounded text-sm"
                >
                  {splitWinnerIds.length}人で分割
                </button>
              )}
            </div>
          )}

          <button onClick={resetGame} className="w-full text-sm text-gray-400 hover:text-white py-2">
            最初からやり直す
          </button>
        </div>
      )}

      {/* ===== RESULT ===== */}
      {gameState === "result" && (
        <div className="max-w-md mx-auto space-y-4">
          <div className="bg-green-800 rounded-xl p-6 text-center">
            <div className="text-5xl mb-2">🏆</div>
            <div className="text-2xl font-bold text-yellow-400">
              {players.find((p) => p.id === winner)?.name} が勝利！
            </div>
          </div>

          <div className="bg-green-800 rounded-xl p-4 space-y-2">
            <h2 className="font-semibold text-lg">チップ状況</h2>
            {[...players].sort((a, b) => b.chips - a.chips).map((p) => (
              <div
                key={p.id}
                className={`flex justify-between items-center px-3 py-2 rounded ${
                  p.id === winner ? "bg-yellow-900" : p.chips === 0 ? "bg-gray-700" : "bg-green-700"
                }`}
              >
                <span>{p.id === winner ? "👑 " : p.chips === 0 ? "💀 " : ""}{p.name}</span>
                <span className="font-mono text-yellow-300">{p.chips} chips</span>
              </div>
            ))}
          </div>

          {/* Rebuy for broke players */}
          {brokePlayers.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <h2 className="font-semibold text-lg text-red-300">リバイ</h2>
              <p className="text-xs text-gray-400">上限: {rebuyAmount} chips / 1回</p>
              {brokePlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => doAddon(p.id)}
                  className="w-full bg-blue-600 hover:bg-blue-500 font-bold py-2 rounded"
                >
                  {p.name} がリバイ (+{rebuyAmount} chips)
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={nextHand}
              className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-xl"
            >
              次のハンド
            </button>
            <button
              onClick={resetGame}
              className="flex-1 bg-green-700 hover:bg-green-600 py-3 rounded-xl"
            >
              最初からやり直す
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

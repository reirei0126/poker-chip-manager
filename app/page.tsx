"use client";

import { useState } from "react";

type Player = {
  id: number;
  name: string;
  chips: number;
  bet: number;
  folded: boolean;
};

type GameState = "setup" | "betting" | "result";

export default function Home() {
  const [gameState, setGameState] = useState<GameState>("setup");
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [startingChips, setStartingChips] = useState(1000);
  const [pot, setPot] = useState(0);
  const [betInput, setBetInput] = useState<Record<number, string>>({});
  const [winner, setWinner] = useState<number | null>(null);

  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    setPlayers((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: newPlayerName.trim(),
        chips: startingChips,
        bet: 0,
        folded: false,
      },
    ]);
    setNewPlayerName("");
  };

  const removePlayer = (id: number) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const startGame = () => {
    if (players.length < 2) return;
    setGameState("betting");
    setPot(0);
    setWinner(null);
  };

  const placeBet = (playerId: number) => {
    const amount = parseInt(betInput[playerId] || "0");
    if (isNaN(amount) || amount <= 0) return;
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p;
        const actual = Math.min(amount, p.chips);
        return { ...p, chips: p.chips - actual, bet: p.bet + actual };
      })
    );
    setBetInput((prev) => ({ ...prev, [playerId]: "" }));
  };

  const fold = (playerId: number) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, folded: true } : p))
    );
  };

  const collectBets = () => {
    const totalBet = players.reduce((sum, p) => sum + p.bet, 0);
    setPot((prev) => prev + totalBet);
    setPlayers((prev) => prev.map((p) => ({ ...p, bet: 0 })));
  };

  const awardPot = (winnerId: number) => {
    collectBets();
    const totalBet = players.reduce((sum, p) => sum + p.bet, 0);
    const totalPot = pot + totalBet;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === winnerId ? { ...p, chips: p.chips + totalPot, bet: 0 } : { ...p, bet: 0 }
      )
    );
    setWinner(winnerId);
    setPot(0);
    setGameState("result");
  };

  const nextHand = () => {
    setPlayers((prev) =>
      prev.map((p) => ({ ...p, bet: 0, folded: false }))
    );
    setWinner(null);
    setGameState("betting");
  };

  const resetGame = () => {
    setGameState("setup");
    setPlayers([]);
    setPot(0);
    setWinner(null);
    setBetInput({});
  };

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
            <div className="flex items-center gap-2">
              <label className="text-sm whitespace-nowrap">初期チップ</label>
              <input
                type="number"
                value={startingChips}
                onChange={(e) => setStartingChips(Number(e.target.value))}
                className="flex-1 bg-green-700 rounded px-3 py-1 text-right"
              />
            </div>
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
                <li
                  key={p.id}
                  className="flex justify-between items-center bg-green-700 rounded px-3 py-2"
                >
                  <span>{p.name}</span>
                  <span className="text-yellow-300 text-sm">{p.chips} chips</span>
                  <button
                    onClick={() => removePlayer(p.id)}
                    className="text-red-400 hover:text-red-300 text-sm ml-2"
                  >
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
          <div className="bg-green-800 rounded-xl p-4 text-center">
            <div className="text-sm text-green-300">現在のポット</div>
            <div className="text-4xl font-bold text-yellow-400">{pot}</div>
            <button
              onClick={collectBets}
              className="mt-2 text-sm bg-green-700 hover:bg-green-600 px-4 py-1 rounded"
            >
              ベットをポットに回収
            </button>
          </div>

          <div className="space-y-3">
            {players.map((p) => (
              <div
                key={p.id}
                className={`rounded-xl p-4 space-y-2 ${
                  p.folded ? "bg-gray-700 opacity-50" : "bg-green-800"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">
                    {p.folded ? "FOLD " : ""}{p.name}
                  </span>
                  <span className="text-yellow-300 font-mono">{p.chips} chips</span>
                </div>
                {p.bet > 0 && (
                  <div className="text-sm text-blue-300">ベット中: {p.bet}</div>
                )}

                {!p.folded && (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="ベット額"
                        value={betInput[p.id] || ""}
                        onChange={(e) =>
                          setBetInput((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => e.key === "Enter" && placeBet(p.id)}
                        className="flex-1 bg-green-700 rounded px-3 py-1 text-right"
                      />
                      <button
                        onClick={() => placeBet(p.id)}
                        className="bg-blue-500 hover:bg-blue-400 px-3 py-1 rounded font-bold"
                      >
                        BET
                      </button>
                      <button
                        onClick={() => fold(p.id)}
                        className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded font-bold"
                      >
                        FOLD
                      </button>
                    </div>
                    <button
                      onClick={() => awardPot(p.id)}
                      className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-1 rounded text-sm"
                    >
                      勝者：{p.name} にポットを付与
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={resetGame}
            className="w-full text-sm text-gray-400 hover:text-white py-2"
          >
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
            {[...players]
              .sort((a, b) => b.chips - a.chips)
              .map((p) => (
                <div
                  key={p.id}
                  className={`flex justify-between items-center px-3 py-2 rounded ${
                    p.id === winner ? "bg-yellow-900" : "bg-green-700"
                  }`}
                >
                  <span>{p.id === winner ? "👑 " : ""}{p.name}</span>
                  <span className="font-mono text-yellow-300">{p.chips} chips</span>
                </div>
              ))}
          </div>

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

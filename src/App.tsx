import { useState } from 'react';
import { Board } from './components/Board';
import { EnergyBar } from './components/EnergyBar';
import { SkillPanel } from './components/SkillPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useGameEngine } from './useGameEngine';
import './App.css';

export default function App() {
  const {
    gameState,
    lastMove,
    message,
    effects,
    renderHints,
    choiceRequest,
    highlightCells,
    handlePlaceStone,
    handleUseSkill,
    generateSkillForGame,
    restart,
  } = useGameEngine();

  const [showSettings, setShowSettings] = useState(false);
  const currentPlayerName = gameState.currentPlayer === 'black' ? '黑方' : '白方';

  return (
    <div className="app">
      <div className="app-header">
        <h1 className="game-title">技能五子棋</h1>
        <button className="settings-btn" onClick={() => setShowSettings(true)} title="设置">
          ⚙️
        </button>
      </div>

      <div className="game-layout">
        {/* 左面板 — 黑方 */}
        <div className="side-panel left-panel">
          <EnergyBar
            player="black"
            energy={gameState.energy.black}
            isCurrentPlayer={gameState.currentPlayer === 'black'}
          />
          <SkillPanel
            player="black"
            isCurrentPlayer={gameState.currentPlayer === 'black'}
            energy={gameState.energy.black}
            skillCache={gameState.skillCache}
            skillCooldowns={gameState.skillCooldowns.black}
            onUseSkill={(idiom, skillDef) => handleUseSkill(idiom, skillDef)}
            onGenerateSkill={generateSkillForGame}
          />
          <div className="turn-info">
            <div className="current-player-indicator">
              <span className={`player-stone ${gameState.currentPlayer}`} />
              <span>{currentPlayerName}的回合</span>
            </div>
            <div className="turn-count">第 {gameState.turnCount + 1} 回合</div>
          </div>

          {gameState.ongoingEffects.length > 0 && (
            <div className="effects-list">
              {gameState.ongoingEffects.map((ef, i) => (
                <div key={i} className="effect-item">
                  ⏳ {ef.description}（{ef.remainingTurns} 回合）
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 棋盘 */}
        <div className="board-column">
          <div className="choice-banner-slot">
            {choiceRequest && (
              <div className="choice-banner">{choiceRequest.prompt}</div>
            )}
          </div>

          <div className="board-container">
            {gameState.gameOver && (
              <div className="game-over-overlay">
                <div className="game-over-card">
                  <h2>{gameState.winner === 'black' ? '黑方' : '白方'} 获胜！</h2>
                  <button onClick={restart} className="restart-btn">重新开始</button>
                </div>
              </div>
            )}

          <Board
            board={gameState.board}
            onCellClick={handlePlaceStone}
            lastMove={lastMove}
            renderHints={renderHints}
            highlightCells={highlightCells}
            effects={effects}
          />
          </div>
        </div>

        {/* 右面板 — 白方 */}
        <div className="side-panel right-panel">
          <EnergyBar
            player="white"
            energy={gameState.energy.white}
            isCurrentPlayer={gameState.currentPlayer === 'white'}
          />
          <SkillPanel
            player="white"
            isCurrentPlayer={gameState.currentPlayer === 'white'}
            energy={gameState.energy.white}
            skillCache={gameState.skillCache}
            skillCooldowns={gameState.skillCooldowns.white}
            onUseSkill={(idiom, skillDef) => handleUseSkill(idiom, skillDef)}
            onGenerateSkill={generateSkillForGame}
          />

          {message && <div className="message-toast">{message}</div>}
          <button onClick={restart} className="restart-btn-small">重新开始</button>
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

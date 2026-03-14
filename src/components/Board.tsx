import React from 'react';
import { Cell, Player, RenderHint } from '../types';

interface BoardProps {
  board: Cell[][];
  onCellClick: (x: number, y: number) => void;
  highlightCells?: Set<string>; // "x,y" format
  lastMove?: { x: number; y: number } | null;
  renderHints?: Record<string, RenderHint>;
  effects?: Array<{ x: number; y: number; type: string; id: number }>;
}

const CELL_SIZE = 40;
const BOARD_SIZE = 15;
const STONE_RADIUS = 17;
const BOARD_PADDING = 20;

function getStoneColor(owner: Player, visibleAs: "black" | "white" | null): string {
  const display = visibleAs ?? owner;
  return display === 'black' ? '#1a1a1a' : '#f0e8d0';
}

export const Board: React.FC<BoardProps> = ({ board, onCellClick, highlightCells, lastMove, renderHints = {}, effects = [] }) => {
  const svgSize = CELL_SIZE * (BOARD_SIZE - 1) + BOARD_PADDING * 2;

  return (
    <div className="board-wrapper">
      <svg
        width={svgSize}
        height={svgSize}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {/* Grid lines */}
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <React.Fragment key={i}>
            <line
              x1={BOARD_PADDING + i * CELL_SIZE} y1={BOARD_PADDING}
              x2={BOARD_PADDING + i * CELL_SIZE} y2={BOARD_PADDING + (BOARD_SIZE - 1) * CELL_SIZE}
              stroke="#8b7355" strokeWidth="1"
            />
            <line
              x1={BOARD_PADDING} y1={BOARD_PADDING + i * CELL_SIZE}
              x2={BOARD_PADDING + (BOARD_SIZE - 1) * CELL_SIZE} y2={BOARD_PADDING + i * CELL_SIZE}
              stroke="#8b7355" strokeWidth="1"
            />
          </React.Fragment>
        ))}

        {/* Star points */}
        {[[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]].map(([px, py]) => (
          <circle key={`star-${px}-${py}`}
            cx={BOARD_PADDING + px * CELL_SIZE} cy={BOARD_PADDING + py * CELL_SIZE}
            r={4} fill="#8b7355"
          />
        ))}

        {/* Cells - click targets and special overlays */}
        {board.map((col, x) => col.map((cell, y) => {
          const cx = BOARD_PADDING + x * CELL_SIZE;
          const cy = BOARD_PADDING + y * CELL_SIZE;
          const isHighlighted = highlightCells?.has(`${x},${y}`);
          const isLastMove = lastMove?.x === x && lastMove?.y === y;

          // Cell tag overlays
          const cellOverlays: React.ReactNode[] = [];
          cell.tags.forEach(tag => {
            const hint = renderHints[`cell:${tag}`] || renderHints[tag];
            if (hint?.backgroundColor) {
              cellOverlays.push(
                <rect key={tag} x={cx - CELL_SIZE/2} y={cy - CELL_SIZE/2}
                  width={CELL_SIZE} height={CELL_SIZE}
                  fill={hint.backgroundColor} opacity={hint.opacity ?? 0.4}
                />
              );
            }
          });

          return (
            <g key={`${x}-${y}`} onClick={() => onCellClick(x, y)}>
              {/* Invisible click area */}
              <rect
                x={cx - CELL_SIZE/2} y={cy - CELL_SIZE/2}
                width={CELL_SIZE} height={CELL_SIZE}
                fill="transparent"
              />
              {cellOverlays}
              {isHighlighted && (
                <rect x={cx - CELL_SIZE/2} y={cy - CELL_SIZE/2}
                  width={CELL_SIZE} height={CELL_SIZE}
                  fill="rgba(255,255,0,0.3)" stroke="yellow" strokeWidth="1"
                />
              )}
              {cell.stone && (
                <>
                  <circle
                    cx={cx} cy={cy} r={STONE_RADIUS}
                    fill={getStoneColor(cell.stone.owner, cell.stone.visibleAs)}
                    stroke={cell.stone.owner === 'black' ? '#333' : '#bbb'}
                    strokeWidth="1.5"
                  />
                  {isLastMove && (
                    <circle cx={cx} cy={cy} r={7} fill={cell.stone.owner === 'black' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)'} />
                  )}
                  {/* Stone tags */}
                  {Array.from(cell.stone.tags).map(tag => {
                    const hint = renderHints[`stone:${tag}`] || renderHints[tag];
                    if (hint?.icon) {
                      return <text key={tag} x={cx} y={cy + 5} textAnchor="middle" fontSize="14">{hint.icon}</text>;
                    }
                    return <circle key={tag} cx={cx + 12} cy={cy - 12} r={5} fill="orange" />;
                  })}
                </>
              )}
            </g>
          );
        }))}

        {/* Visual effects */}
        {effects.map(ef => {
          const cx = BOARD_PADDING + ef.x * CELL_SIZE;
          const cy = BOARD_PADDING + ef.y * CELL_SIZE;
          return (
            <g key={ef.id}>
              <circle cx={cx} cy={cy} r={STONE_RADIUS + 5} fill="none" stroke="gold" strokeWidth="3" opacity="0.8" className="effect-pulse" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

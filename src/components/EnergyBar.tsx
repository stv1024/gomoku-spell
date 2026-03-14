import React from 'react';
import { Player } from '../types';

interface EnergyBarProps {
  player: Player;
  energy: number;
  maxEnergy?: number;
  isCurrentPlayer: boolean;
}

export const EnergyBar: React.FC<EnergyBarProps> = ({ player, energy, maxEnergy = 5, isCurrentPlayer }) => {
  return (
    <div className={`energy-bar ${isCurrentPlayer ? 'active' : ''}`}>
      <span className="player-label">{player === 'black' ? '黑方' : '白方'}</span>
      <div className="energy-dots">
        {Array.from({ length: maxEnergy }, (_, i) => (
          <div key={i} className={`energy-dot ${i < energy ? 'filled' : 'empty'}`} />
        ))}
      </div>
      <span className="energy-count">{energy}/{maxEnergy}</span>
    </div>
  );
};

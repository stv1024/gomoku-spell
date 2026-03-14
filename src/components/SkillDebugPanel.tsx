import React from 'react';
import { SkillDefinition } from '../types';

interface SkillDebugPanelProps {
  skill: SkillDefinition;
  idiom: string;
  onClose: () => void;
}

export const SkillDebugPanel: React.FC<SkillDebugPanelProps> = ({ skill, idiom, onClose }) => {
  const json = JSON.stringify(
    { ...skill, execute: undefined, renderHints: skill.renderHints },
    null, 2,
  );

  return (
    <div className="debug-overlay" onClick={onClose}>
      <div className="debug-panel" onClick={e => e.stopPropagation()}>
        <div className="debug-header">
          <span className="debug-title">🔧 技能调试 — {idiom}</span>
          <button className="debug-close" onClick={onClose}>✕</button>
        </div>

        <div className="debug-section">
          <div className="debug-label">基本属性</div>
          <pre className="debug-pre">{json}</pre>
        </div>

        <div className="debug-section">
          <div className="debug-label">execute 代码</div>
          <pre className="debug-pre debug-code">{skill.execute}</pre>
        </div>
      </div>
    </div>
  );
};

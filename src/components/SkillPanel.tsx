import React, { useState } from 'react';
import { Player, SkillDefinition } from '../types';
import { SkillDebugPanel } from './SkillDebugPanel';

interface SkillPanelProps {
  player: Player;
  isCurrentPlayer: boolean;
  energy: number;
  skillCache: Map<string, SkillDefinition>;
  skillCooldowns: Map<string, number>;
  onUseSkill: (idiom: string, skillDef: SkillDefinition) => Promise<void>;
  onGenerateSkill: (idiom: string) => Promise<SkillDefinition>;
}

export const SkillPanel: React.FC<SkillPanelProps> = ({
  player,
  isCurrentPlayer,
  energy,
  skillCache,
  skillCooldowns,
  onUseSkill,
  onGenerateSkill,
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<SkillDefinition | null>(null);
  const [previewIdiom, setPreviewIdiom] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  const handleGenerate = async () => {
    const idiom = input.trim();
    if (!idiom) return;
    if (idiom.length < 3) { setError('请输入至少3个字的成语'); return; }

    // 本局缓存直接预览
    if (skillCache.has(idiom)) {
      setPreview(skillCache.get(idiom)!);
      setPreviewIdiom(idiom);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const skill = await onGenerateSkill(idiom);
      setPreview(skill);
      setPreviewIdiom(idiom);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!preview || !previewIdiom) return;
    onUseSkill(previewIdiom, preview);
    setPreview(null);
    setPreviewIdiom('');
    setInput('');
  };

  const handleCancel = () => {
    setPreview(null);
    setPreviewIdiom('');
  };

  const cdForPreview = previewIdiom ? (skillCooldowns.get(previewIdiom) ?? 0) : 0;
  const canUse = preview && energy >= preview.cost && cdForPreview === 0 && isCurrentPlayer;

  return (
    <div className={`skill-panel ${isCurrentPlayer ? 'active' : ''}`}>
      <div className="skill-panel-title">
        {player === 'black' ? '黑方' : '白方'}技能
      </div>

      <div className="skill-input-row">
        <input
          className="skill-input"
          placeholder={isCurrentPlayer ? '输入成语…' : '等待对方…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && isCurrentPlayer && handleGenerate()}
          disabled={loading || !isCurrentPlayer}
          maxLength={8}
        />
        <button
          className="skill-generate-btn"
          onClick={handleGenerate}
          disabled={loading || !input.trim() || !isCurrentPlayer}
        >
          {loading ? '生成中…' : '生成'}
        </button>
      </div>

      {error && <div className="skill-error">{error}</div>}

      {preview && (
        <div className="skill-card">
          <div className="skill-card-name">
          {preview.name}
          <button className="skill-debug-btn" onClick={() => setShowDebug(true)} title="查看技能详情">🔧</button>
        </div>
          <div className="skill-card-flavor">「{preview.flavor}」</div>
          <div className="skill-card-desc">{preview.description}</div>
          <div className="skill-card-meta">
            <span className="skill-cost">⚡ {preview.cost}</span>
            <span className="skill-cooldown">🕐 {preview.cooldown} 回合</span>
            {preview.requiresTarget && <span className="skill-target">🎯 需要目标</span>}
          </div>

          {cdForPreview > 0 && (
            <div className="skill-cd-warning">冷却中（剩余 {cdForPreview} 回合）</div>
          )}
          {energy < (preview.cost) && (
            <div className="skill-cd-warning">能量不足（需 {preview.cost} 点）</div>
          )}

          <div className="skill-card-actions">
            {isCurrentPlayer && (
              <button
                className="skill-use-btn"
                onClick={handleConfirm}
                disabled={!canUse}
              >
                发动技能
              </button>
            )}
            <button className="skill-cancel-btn" onClick={handleCancel}>
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 本局已有缓存的技能列表 */}
      {skillCache.size > 0 && !preview && (
        <div className="skill-history">
          {[...skillCache.entries()].map(([idiom, skill]) => {
            const cd = skillCooldowns.get(idiom) ?? 0;
            return (
              <button
                key={idiom}
                className={`skill-history-item ${cd > 0 ? 'on-cooldown' : ''}`}
                onClick={() => {
                  setPreview(skill);
                  setPreviewIdiom(idiom);
                  setInput(idiom);
                }}
                title={skill.description}
              >
                {idiom}
                {cd > 0 && <span className="cd-badge">{cd}</span>}
              </button>
            );
          })}
        </div>
      )}
      {showDebug && preview && (
        <SkillDebugPanel
          skill={preview}
          idiom={previewIdiom}
          onClose={() => setShowDebug(false)}
        />
      )}
    </div>
  );
};

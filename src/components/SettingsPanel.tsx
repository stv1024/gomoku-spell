import React, { useState } from 'react';
import { getApiKey, getModel, saveApiKey, saveModel, DEFAULT_MODEL } from '../aiService';

interface SettingsPanelProps {
  onClose: () => void;
}

const PRESET_MODELS = [
  { label: 'Gemini 2.5 Flash ⚡', value: 'google/gemini-2.5-flash' },
  { label: 'Gemini 2.5 Pro', value: 'google/gemini-2.5-pro' },
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5' },
  { label: 'DeepSeek R1', value: 'deepseek/deepseek-r1' },
  { label: 'DeepSeek Chat', value: 'deepseek/deepseek-chat' },
  { label: 'Llama 3.3 70B (免费)', value: 'meta-llama/llama-3.3-70b-instruct:free' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const [apiKey, setApiKey] = useState(getApiKey);
  const [model, setModel] = useState(getModel);
  const [customModel, setCustomModel] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveApiKey(apiKey.trim());
    saveModel((customModel.trim() || model).trim() || DEFAULT_MODEL);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <label className="settings-label">
            OpenRouter API Key
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="settings-link"
            >
              获取 Key →
            </a>
          </label>
          <input
            className="settings-input"
            type="password"
            placeholder="sk-or-v1-…"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <p className="settings-hint">Key 仅存于本地 localStorage，不会上传</p>
        </div>

        <div className="settings-section">
          <label className="settings-label">模型</label>
          <div className="model-presets">
            {PRESET_MODELS.map(m => (
              <button
                key={m.value}
                className={`model-preset-btn ${model === m.value && !customModel ? 'selected' : ''}`}
                onClick={() => { setModel(m.value); setCustomModel(''); }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <input
            className="settings-input"
            placeholder="或输入自定义 model slug…"
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
          />
          <p className="settings-hint">
            当前：{customModel.trim() || model}
          </p>
        </div>

        <button
          className={`settings-save-btn ${saved ? 'saved' : ''}`}
          onClick={handleSave}
        >
          {saved ? '已保存 ✓' : '保存'}
        </button>
      </div>
    </div>
  );
};

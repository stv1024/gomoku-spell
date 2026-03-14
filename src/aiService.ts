import { SkillDefinition } from './types';

// ── 配置 ─────────────────────────────────────────────────────────────────────

export const DEFAULT_MODEL = 'google/gemini-2.5-flash';
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export function getApiKey(): string {
  const envKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
  // 防止 Vite 将未定义的环境变量渲染为字符串 "undefined"
  if (envKey && envKey !== 'undefined') return envKey.trim();
  return (localStorage.getItem('openrouter_api_key') ?? '').trim();
}

export function saveApiKey(key: string) {
  localStorage.setItem('openrouter_api_key', key);
}

export function getModel(): string {
  return localStorage.getItem('openrouter_model') || DEFAULT_MODEL;
}

export function saveModel(model: string) {
  localStorage.setItem('openrouter_model', model);
}

// ── BoardAPI 文档字符串（注入 prompt 的核心） ──────────────────────────────

const BOARD_API_DOC = `
## BoardAPI 参考（你的 execute 函数只能调用这些方法）

### 空间查询
- \`api.getBoardSize()\` → number（固定返回 15）
- \`api.getCell(x, y)\` → Cell | null
- \`api.getStone(x, y)\` → Stone | null（无棋子返回 null）
- \`api.findCells(filter: (cell) => boolean)\` → Cell[]
- \`api.getNeighbors(x, y, range?)\` → Cell[]（range 默认 1，square 范围）
- \`api.getLine(x, y, dir: [dx,dy], len)\` → Cell[]（沿方向取 len 个格子）
- \`api.getConnections(player, minLen?)\` → Cell[][]（返回所有连线，minLen 默认 2）

### 实体变更
- \`api.placeStone(x, y, owner, opts?)\` → boolean（owner: "black"|"white"）
- \`api.removeStone(x, y, reason?)\` → boolean
- \`api.moveStone(fromX, fromY, toX, toY)\` → boolean
- \`api.transformStone(x, y, changes)\` → boolean（修改棋子属性，如 \`{ owner: "black" }\`）
- \`api.modifyCell(x, y, { tags?: Set, props?: Map, triggers?: Map })\`
- \`api.modifyArea(cx, cy, range, shape: "square"|"diamond", { stoneTags?, cellTags? })\`

### 时间控制
- \`api.addDelayedEffect({ delayTurns, effect: async (api) => {}, desc })\`
- \`api.addOngoingEffect({ duration, onEachTurn: async (api) => {}, onExpire: async (api) => {}, desc })\`
- \`api.registerGlobalTrigger(event, callback, duration?)\`（event 如 "onTurnEnd"）

### 流程控制
- \`api.grantExtraTurn(n?)\`（给当前玩家额外 n 回合，默认 1）
- \`api.skipNextTurn(player)\`（让指定玩家跳过下一回合）

### 信息查询
- \`api.getCurrentPlayer()\` → "black"|"white"
- \`api.getOpponentPlayer()\` → "black"|"white"
- \`api.getTurnCount()\` → number
- \`api.getHistory(n?)\` → 最近 n 条历史记录

### UI
- \`api.showMessage(text)\`（在屏幕上显示提示文字）
- \`api.showEffect(x, y, type, opts?)\`（在格子上显示特效，type 如 "flash"）
- \`await api.requestPlayerChoice(player, prompt, filter?)\` → [x, y]（让玩家点击选择一个格子）

### Cell 结构
\`\`\`
{ x, y, stone: Stone|null, tags: Set<string>, props: Map<string,any> }
\`\`\`

### Stone 结构
\`\`\`
{ owner: "black"|"white", visibleAs: "black"|"white"|null, tags: Set<string>, props: Map<string,any> }
\`\`\`

### renderHints 格式
每个 key 是 tag 名称，value 是：
\`\`\`
{ backgroundColor?: string, borderColor?: string, icon?: string, opacity?: number }
\`\`\`
例：\`{ "frozen": { backgroundColor: "#88ccff", icon: "❄️", opacity: 0.5 } }\`
`.trim();

// ── Prompt 构造 ───────────────────────────────────────────────────────────────

function buildPrompt(idiom: string): string {
  return `你是一个五子棋技能设计师。玩家输入了成语「${idiom}」。

请根据这个成语的含义，设计一个五子棋技能，输出严格符合以下格式的 JSON（不要有任何多余文字）：

\`\`\`json
{
  "name": "成语原文",
  "description": "一句话描述技能效果（20字以内）",
  "flavor": "趣味文案（15字以内，可引用成语故事）",
  "cost": 2,
  "cooldown": 2,
  "requiresTarget": false,
  "execute": "// async (api, target) => {} 的函数体字符串\\nconst player = api.getCurrentPlayer();\\n// ...",
  "renderHints": {}
}
\`\`\`

${BOARD_API_DOC}

设计原则：
1. 技能效果要贴合成语的字面或引申含义，让人一看就懂
2. cost（1-5）和 cooldown（0-5）要与效果强度匹配，强效果要高消耗
3. 禁止一击必杀（如一次移除超过 4 颗对手棋子）
4. execute 函数体只能调用 api 上的方法，不能使用 fetch、DOM、全局变量等
5. 如果 requiresTarget 为 true，系统会在执行前让玩家点击棋盘，target 参数会以 [x, y] 形式传入，直接使用即可，不要在 execute 里再调用 requestPlayerChoice
6. 需要"以某点为中心"的范围技能（如震动、冻结一片区域）应设 requiresTarget: true
7. renderHints 只需要为技能新增的 tag 提供渲染提示
8. 只输出 JSON，不要 markdown 代码块，不要解释

成语：${idiom}`;
}

// ── 主调用函数 ────────────────────────────────────────────────────────────────

export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_KEY' | 'NETWORK' | 'PARSE' | 'API_ERROR',
  ) {
    super(message);
  }
}

export async function generateSkill(idiom: string): Promise<SkillDefinition> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AIServiceError(
      '请先在设置中填写 OpenRouter API Key',
      'NO_KEY',
    );
  }

  const model = getModel();
  const prompt = buildPrompt(idiom);

  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'http://localhost',
        'X-Title': 'Gomoku Spell',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        // 不强制 response_format（部分模型不支持），靠 prompt 约束
        temperature: 0.7,
      }),
    });
  } catch (e) {
    throw new AIServiceError(`网络错误：${(e as Error).message}`, 'NETWORK');
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg += `: ${errBody?.error?.message ?? JSON.stringify(errBody)}`;
    } catch { /* ignore */ }
    throw new AIServiceError(errMsg, 'API_ERROR');
  }

  const data = await response.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? '';

  // 容错：有些模型仍会包在 ```json ... ``` 里
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let skillDef: SkillDefinition;
  try {
    skillDef = JSON.parse(cleaned);
  } catch {
    console.error('[generateSkill] 原始响应：', raw);
    throw new AIServiceError(
      `AI 返回了无法解析的内容，请重试。（原始内容：${raw.slice(0, 100)}…）`,
      'PARSE',
    );
  }

  // 基础校验与补全
  if (!skillDef.name) skillDef.name = idiom;
  if (typeof skillDef.cost !== 'number') skillDef.cost = 2;
  if (typeof skillDef.cooldown !== 'number') skillDef.cooldown = 2;
  if (typeof skillDef.requiresTarget !== 'boolean') skillDef.requiresTarget = false;
  if (typeof skillDef.execute !== 'string') skillDef.execute = 'api.showMessage("技能无效果");';
  if (!skillDef.renderHints) skillDef.renderHints = {};
  // 限制 cost/cooldown 范围
  skillDef.cost = Math.max(1, Math.min(5, skillDef.cost));
  skillDef.cooldown = Math.max(0, Math.min(5, skillDef.cooldown));

  return skillDef;
}

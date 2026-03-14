# 技能五子棋 — 需求与开发计划

## 一、项目概述

一款在经典五子棋基础上加入"成语技能"的策略游戏。玩家说出任意一个成语，AI 实时将其解读为一个五子棋棋盘上的技能效果，生成可执行的技能代码。核心实验目标是验证"运行时由 AI 生成游戏机制与逻辑"的可行性。

V1 版本只做双人本地对战（两人共用一个屏幕轮流操作）。未来会扩展 PVE 模式，但本次不涉及。

---

## 二、核心玩法

1. 两名玩家在 15×15 棋盘上轮流落子，先连成五子者获胜（标准五子棋规则）。
2. 每个玩家拥有"能量值"资源（初始 3 点，每回合自然回复 1 点，上限 5 点）。
3. 在自己的回合，玩家可以选择：
   - **普通落子**：不消耗能量，在空位放一颗己方棋子。
   - **发动技能**：在输入框中输入一个四字成语，系统调用 AI 实时生成该成语对应的技能，玩家确认后执行。技能消耗不等的能量。使用技能后本回合视为已行动（不再额外落子，除非技能本身包含落子效果）。
4. 每个技能有独立冷却回合数，同一个成语不能连续使用。
5. 同一个成语在同一局游戏中的技能效果固定（第一次使用时生成，后续复用）。

---

## 三、技术架构

### 3.1 整体结构

```
┌────────────────────────────────────────────────────┐
│                    前端 (React)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  棋盘渲染  │  │  技能UI   │  │  成语输入 & 展示  │ │
│  └────┬─────┘  └────┬─────┘  └───────┬──────────┘ │
│       └──────────────┴───────────────┘             │
│                      │                             │
│              ┌───────┴────────┐                    │
│              │   游戏引擎核心   │                    │
│              │  (GameEngine)  │                    │
│              └───────┬────────┘                    │
│                      │                             │
│         ┌────────────┴────────────┐                │
│         │     技能沙盒执行器       │                │
│         │  (SkillSandbox)        │                │
│         └────────────┬────────────┘                │
│                      │                             │
│         ┌────────────┴────────────┐                │
│         │   AI 技能生成服务调用    │                │
│         │  (Anthropic API call)   │                │
│         └─────────────────────────┘                │
└────────────────────────────────────────────────────┘
```

### 3.2 技术选型

- **前端框架**：React + TypeScript（Vite 构建）
- **AI 服务**：[OpenRouter](https://openrouter.ai) API，从前端直接调用（使用标准 `fetch`，兼容 OpenAI Chat Completions 格式，无需额外 SDK）。默认模型 `google/gemini-2.0-flash-exp`，可在设置界面切换为任意 OpenRouter 支持的模型。
- **技能执行**：在受限作用域内通过 `new Function()` 执行 AI 生成的代码，传入 BoardAPI 对象
- **状态管理**：React useState/useReducer，纯前端，无后端
- **API Key 配置（V1 临时方案）**：在游戏设置界面提供输入框，Key 存入 localStorage，不随代码提交。支持通过 `VITE_OPENROUTER_API_KEY` 环境变量预填（本地开发用）。
- **AI 服务抽象层（后续扩展）**：将 AI 调用封装在统一的 `AIProvider` interface 后面，V1 只实现 OpenRouterProvider，后续可按需扩展。模型切换通过设置界面的输入框完成（直接填写 OpenRouter model slug，如 `anthropic/claude-3-5-haiku`）。

### 3.3 数据结构

#### 格子 (Cell)
```typescript
interface Stone {
  owner: "black" | "white";
  visibleAs: "black" | "white" | null;  // null = 隐身（V1 暂不实现信息隐藏逻辑）
  tags: Set<string>;       // 开放标签，如 "frozen", "shielded"
  props: Map<string, any>; // 开放属性，如 { turnsAlive: 0, power: 3 }
  triggers: Map<string, Function>;  // 如 { onRemoved: fn }
}

interface Cell {
  x: number;
  y: number;
  stone: Stone | null;
  tags: Set<string>;         // 格子自身标签，如 "blocked"
  props: Map<string, any>;
  triggers: Map<string, Function>;
}
```

#### 技能定义 (SkillDefinition)
```typescript
interface SkillDefinition {
  name: string;           // 成语原文
  description: string;    // 一句话效果描述
  flavor: string;         // 趣味文案
  cost: number;           // 能量消耗 (1-5)
  cooldown: number;       // 冷却回合数 (0-5)
  requiresTarget: boolean;
  execute: string;        // AI 生成的 JS 函数体字符串，签名：async (api, target?) => {}
  renderHints: Record<string, RenderHint>;  // 新 tag 的渲染提示
}
```

#### 游戏状态 (GameState)
```typescript
interface GameState {
  board: Cell[][];           // 15×15
  currentPlayer: "black" | "white";
  turnCount: number;
  history: Array<{ player: Player; x?: number; y?: number; skill?: string; snapshot: Cell[][] }>;

  globalTags: Set<string>;
  globalProps: Map<string, any>;
  globalTriggers: Map<string, Function[]>;

  delayedEffects: Array<{ triggerTurn: number; effect: Function; description: string }>;
  ongoingEffects: Array<{ remainingTurns: number; onEachTurn: Function; onExpire: Function; description: string }>;

  energy: { black: number; white: number };
  skillCache: Map<string, SkillDefinition>;   // 成语 → 已生成的技能，本局复用
  skillCooldowns: { black: Map<string, number>; white: Map<string, number> };
}
```

### 3.4 BoardAPI（暴露给 AI 生成代码的接口）

按六个维度组织：

**空间查询**：`getCell(x,y)`, `getStone(x,y)`, `findCells(filter)`, `getNeighbors(x,y,range)`, `getLine(x,y,dir,len)`, `getConnections(player,minLen)`, `getBoardSize()`

**实体变更**：`placeStone(x,y,owner,opts)`, `removeStone(x,y,reason)`, `moveStone(fx,fy,tx,ty)`, `transformStone(x,y,changes)`, `modifyCell(x,y,changes)`, `modifyArea(cx,cy,range,shape,changes)`

**时间控制**：`addDelayedEffect({delayTurns,effect,desc})`, `addOngoingEffect({duration,onEachTurn,onExpire,desc})`, `registerGlobalTrigger(event,callback,duration)`

**流程控制**：`grantExtraTurn(n)`, `skipNextTurn(player)`, `forceNextMove(player,positions)`, `modifyWinCondition(changes)`

**信息与元数据**：`getCurrentPlayer()`, `getOpponentPlayer()`, `getTurnCount()`, `getHistory(n)`, `hasGlobalTag(tag)`, `getGlobalProp(key)`

**交互与UI**：`showMessage(text)`, `showEffect(x,y,type,opts)`, `requestPlayerChoice(player,prompt,filter)` — 返回玩家选择的坐标

### 3.5 事件生命周期（一个回合内的时序）

```
onTurnStart
  → 延迟效果检查 → 持续效果执行 → 棋子/格子 triggers 触发
onBeforeSkill(player, skillName, params)
  → 可拦截/取消技能
onSkillExecute(player, skillName, params)
  → 技能主体逻辑执行
onAfterSkill(player, skillName, result)
onBeforePlace(player, x, y)
  → 可拦截/重定向/修改
onAfterPlace(player, x, y)
  → 触发格子 onStonePlaced
onStoneRemoved(player, x, y, reason)
onStoneTransformed(x, y, from, to)
onBeforeWinCheck(lines)
  → 可修改哪些连线有效
onWinCheck(result)
  → 可覆盖胜负判定
onTurnEnd
  → 持续效果回合数递减 → 过期效果清理 → 回合交替
```

### 3.6 AI 技能生成

玩家输入成语后，前端调用 OpenRouter API（OpenAI Chat Completions 格式），prompt 大致为：

```
你是一个五子棋技能设计师。玩家输入了成语「{idiom}」。
请根据这个成语的含义，设计一个五子棋技能，并输出以下 JSON 结构：

{
  name: string,          // 成语原文
  description: string,   // 一句话描述效果
  flavor: string,        // 趣味文案
  cost: number,          // 能量消耗 (1-5)
  cooldown: number,      // 冷却回合数 (0-5)
  requiresTarget: boolean,
  execute: string,       // 一个 JS 函数体字符串，签名为 async (api, target?) => {}
  renderHints: object    // 新增 tag 的渲染提示
}

你可以使用的 API：
{BoardAPI 完整文档字符串}

设计原则：
1. 技能效果要贴合成语的字面或引申含义
2. cost 和 cooldown 要与效果强度匹配
3. 不要设计一击必杀的效果（如直接清空对手所有棋子）
4. execute 函数中只能调用 api 上的方法，不能访问外部变量或 DOM
5. 只输出合法 JSON，不要有多余文字
```

前端收到响应后解析 JSON，将 `execute` 字符串通过 `new Function("api", "target", executeString)` 转化为可执行函数，存入 `skillCache`。

调用方式（伪代码）：
```typescript
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': location.origin,
  },
  body: JSON.stringify({
    model: selectedModel,           // 如 "google/gemini-2.0-flash-exp"
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  }),
});
const json = await res.json();
const skillDef = JSON.parse(json.choices[0].message.content);
```

> **模型选择**：默认使用 `google/gemini-2.0-flash-exp`（速度快、支持 JSON 模式）。OpenRouter 汇聚了几乎所有主流模型，玩家可在设置界面填写任意 model slug 切换，无需改代码。

### 3.7 渲染层规则

引擎维护一个 `renderHintsRegistry`（初始为空），每次新技能带来新的 renderHints 就合并进去。

棋盘渲染逻辑：
- 遍历每个格子，根据 `cell.tags` 查 registry 决定格子样式（如 blocked → 半透明蓝色遮罩）
- 如果有棋子，根据 `stone.visibleAs` 决定显示颜色（V1 暂不实现信息隐藏，visibleAs 始终等于 owner）
- 根据 `stone.tags` 查 registry 叠加图标/动画
- 未识别的 tag 统一显示小圆点标记

---

## 四、V1 开发任务拆分

### Phase 0：项目初始化
- [ ] 0.1 Vite + React + TypeScript 项目脚手架搭建
- [ ] 0.2 定义核心 TypeScript 类型文件（`types.ts`：Cell、Stone、GameState、SkillDefinition、BoardAPI interface）
- [ ] 0.3 封装 `aiService.ts`：实现 OpenRouter API 调用（原生 fetch，兼容 OpenAI 格式）；API Key 从 `VITE_OPENROUTER_API_KEY` 环境变量读取，回退到 localStorage；封装 `AIProvider` interface（V1 只实现 OpenRouterProvider）

> **为什么先定义类型**：GameState 和 BoardAPI 的 TypeScript interface 是后续所有模块的契约，先确定类型可以让引擎、渲染、AI 调用三条线并行开发时不产生接口分歧。

### Phase 1：基础五子棋（无技能）
- [ ] 1.1 棋盘组件：15×15 网格渲染，点击落子
- [ ] 1.2 游戏引擎核心：GameState 初始化、轮流落子、五连判定
- [ ] 1.3 基础 UI：当前玩家提示、落子历史、胜负弹窗、重新开始

### Phase 2：引擎扩展（支撑技能系统）
- [ ] 2.1 完整数据结构：Cell/Stone 的 tags/props/triggers 实现（基于 Phase 0 类型定义）
- [ ] 2.2 事件系统：实现完整的事件生命周期和 trigger 调度
- [ ] 2.3 BoardAPI 实现：所有查询与变更函数
- [ ] 2.4 延迟效果与持续效果的调度器
- [ ] 2.5 能量系统：初始值、回合回复、上限、消耗

### Phase 3：AI 技能生成与执行
- [ ] 3.1 准备 BoardAPI 参考文档字符串：将 BoardAPI 所有方法的签名、参数说明、示例整理为注入 prompt 的文本（这是 prompt 工程最关键的输入，质量直接决定 AI 生成代码的可用率）
- [ ] 3.2 成语输入 UI：输入框 + 生成中状态 + 技能预览卡片（显示名称、描述、消耗）
- [ ] 3.3 AI 调用：构造 prompt → 调用 Anthropic API → 解析返回的技能 JSON，含基础容错（JSON 解析失败时给出友好提示）
- [ ] 3.4 技能沙盒执行：将 execute 字符串转为函数并在受限上下文中运行
- [ ] 3.5 技能缓存与冷却：同一局内相同成语复用已生成技能，冷却回合追踪
- [ ] 3.6 目标选择交互：当 requiresTarget=true 时，高亮可选格子，等待玩家点击

---

> ### ★ 核心验证里程碑
>
> **Phase 3 完成后即可验证核心假设**："AI 能否在运行时生成可用的五子棋技能？"
>
> 验收标准：
> - 输入 3～5 个风格差异较大的成语（如"偷梁换柱"、"以逸待劳"、"天罗地网"）
> - AI 每次都能返回合法 JSON，execute 代码在沙盒中无异常执行
> - 技能效果在棋盘上有可见的、合理的变化
>
> 若核心假设成立，继续推进 Phase 4/5；若发现严重问题（如代码生成可用率低、效果与成语含义严重偏离），优先迭代 prompt 和 BoardAPI 文档，再推进后续阶段。

---

### Phase 4：渲染与体验
- [ ] 4.1 动态渲染系统：根据 tags 和 renderHints 渲染棋子/格子的特殊状态
- [ ] 4.2 技能特效动画：showEffect 的基础视觉反馈（CSS 动画，从简）
- [ ] 4.3 技能历史面板：展示本局已使用的成语和效果说明
- [ ] 4.4 能量条 UI：显示双方当前能量

> **注**：信息隐藏（visibleAs / 对手不可见棋子）V1 暂不实现，架构已预留，后续按需补充。

### Phase 5：打磨
- [ ] 5.1 错误处理：AI 返回格式异常、技能代码执行出错的兜底与用户提示
- [ ] 5.2 技能平衡兜底：基础校验（cost=0 但效果涉及大范围移除时自动拒绝）
- [ ] 5.3 移动端适配
- [ ] 5.4 **[可选] 悔棋**：基于 history 快照还原，仅支持悔一步

---

## 五、关键设计决策备忘

1. **技能代码执行安全**：V1 用 `new Function` + 只传入 BoardAPI 对象即可，不需要 Web Worker。AI 生成的代码只能操作 api 上暴露的方法，无法访问 DOM、window 等。后续如有需要再升级到 Worker 隔离。

2. **同一局内技能缓存**：同一个成语在一局中只生成一次，避免重复调用 API 且保证一致性。不同局之间不缓存，鼓励每局的新鲜感。

3. **能量数值初版**：初始 3，每回合 +1，上限 5。技能消耗 1-5。这个数值后续根据实际体验调整。

4. **V1 不做的事情**：信息隐藏（visibleAs 逻辑）、多 AI provider 切换 UI、PVE 模式、联网对战、技能商店/收藏、排行榜、复杂的平衡系统。

5. **渲染降级策略**：遇到未知 tag 不崩溃，统一显示通用标记。保证 AI 生成任何合法技能都不会导致渲染层报错。

6. **BoardAPI 文档字符串是 prompt 工程核心**：注入给 AI 的 API 参考越清晰（含参数类型、返回值、调用示例），AI 生成的代码可用率越高。这个文档应在 Phase 3.1 中仔细打磨，并在验证里程碑阶段反复迭代。

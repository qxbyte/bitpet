# 需求文档：BitPet

Spec Type: Feature
Workflow: requirements-first
Status: Requirements Draft
Review Status: confirmed

## 简介

BitPet 是一款运行在 macOS 桌面上的电子宠物应用，由用户从终端 CLI 工具（Claude Code、Codex、OpenCode 等）启动和控制。宠物以像素风精灵的形态悬浮在桌面上，具备独立的状态机（饥饿度、心情、精力），支持鼠标互动与定时动画。

**核心差异化功能**：BitPet 通过本地 IPC Unix Socket 与 CLI 工具实时通信，将 Claude Code 等工具的会话名称、模型输出实时以聊天气泡形式展示在宠物旁边，实现"AI 助手的实体化"体验。

目标用户：使用 Claude Code / Codex / OpenCode 等 AI 编程 CLI 工具的开发者。
平台：macOS（优先），后续支持 Windows。

---

## 词汇表

- **BitPet**：本应用及其管理的桌面宠物实例。
- **Daemon**：BitPet 的后台进程，管理宠物窗口、IPC Socket 服务器和状态持久化。
- **Socket 服务器**：Daemon 启动的 Unix Domain Socket，路径为 `$TMPDIR/bitpet.sock`，接收来自 CLI 工具的消息。
- **CLI 客户端**：`bitpet` 命令行程序，向 Daemon 发送指令。
- **Hook**：Claude Code / Codex 等工具的钩子脚本，在特定事件时向 BitPet Socket 发送消息。
- **聊天气泡**：悬浮在宠物旁边的文字气泡，显示来自 CLI 工具的消息内容。
- **宠物状态**：饥饿度（Hunger）、心情（Mood）、精力（Energy）三个数值，取值 0–100。
- **精灵动画**：基于帧序列的像素风动画，表达宠物不同的情绪和动作。

---

## 需求

### 需求 1：桌面宠物窗口

**用户故事：** 作为开发者，我希望在桌面上看到一个始终可见的像素风宠物，以便在编码时获得陪伴感而不影响工作。

#### 验收标准

1. WHEN BitPet Daemon 启动，THE 宠物窗口 SHALL 以无边框、透明背景的悬浮窗形式出现在桌面右下角（默认位置）。
2. WHILE 宠物窗口存在，THE 窗口 SHALL 保持在所有其他窗口之上（always-on-top），且不出现在 Mission Control / Expose 缩略图中。
3. WHEN 用户拖拽宠物窗口，THE 宠物 SHALL 跟随鼠标移动到新位置，且该位置在重启后恢复。
4. WHEN Daemon 关闭，THE 宠物窗口 SHALL 立即消失，不留残影。
5. THE 宠物精灵 SHALL 以至少 4 种颜色的像素风格绘制，尺寸为 64×64 至 128×128 像素，支持帧动画。

---

### 需求 2：宠物状态机

**用户故事：** 作为用户，我希望宠物有饥饿、心情和精力状态，以便通过互动让宠物保持健康活泼。

#### 验收标准

1. THE 宠物 SHALL 维护三个状态值：饥饿度（0=饱，100=极度饥饿）、心情（0=沮丧，100=快乐）、精力（0=精疲力竭，100=充沛）。
2. WHEN 应用运行超过 30 分钟未交互，THE 饥饿度 SHALL 增加 10 点，精力 SHALL 减少 5 点。
3. WHEN 饥饿度 ≥ 80，THE 宠物动画 SHALL 切换为"饥饿"状态（耷拉眼皮、慢动作），且宠物周期性发出饥饿提示气泡。
4. WHEN 精力 ≤ 20，THE 宠物 SHALL 进入"瞌睡"动画状态。
5. THE 宠物状态 SHALL 持久化到本地配置文件，重启后恢复上次状态。

---

### 需求 3：CLI 命令集

**用户故事：** 作为开发者，我希望通过简短的终端命令控制宠物，以便在不离开终端的情况下与宠物互动。

#### 验收标准

1. WHEN 用户执行 `bitpet init`，THE CLI SHALL 启动 Daemon（若未运行），创建默认配置，并显示宠物窗口。
2. WHEN 用户执行 `bitpet feed`，THE 宠物 SHALL 播放"进食"动画，饥饿度降低 30 点（不低于 0），心情增加 20 点（不超过 100）。
3. WHEN 用户执行 `bitpet play`，THE 宠物 SHALL 播放"玩耍"动画（持续约 3 秒），心情增加 15 点，精力减少 10 点。
4. WHEN 用户执行 `bitpet status`，THE CLI SHALL 在终端输出当前饥饿度、心情、精力数值及对应文字描述（如 "😊 心情极好 | 🍖 微饿 | ⚡ 精力充沛"）。
5. WHEN 用户执行 `bitpet stop`，THE Daemon SHALL 优雅退出，宠物窗口关闭，状态保存。
6. IF Daemon 未运行时执行除 `init` 外的命令，THE CLI SHALL 提示用户先运行 `bitpet init`。

---

### 需求 4：互动动画

**用户故事：** 作为用户，我希望宠物对我的鼠标操作和时间流逝有反应，以便感受到宠物的"生命感"。

#### 验收标准

1. WHEN 鼠标悬停在宠物窗口上，THE 宠物 SHALL 在 200ms 内切换为"注意"动画（眼睛转向鼠标、微微抬头）。
2. WHEN 鼠标离开宠物窗口，THE 宠物 SHALL 在 1 秒后恢复"待机"（idle）动画。
3. WHEN 鼠标点击宠物，THE 宠物 SHALL 播放"被戳"动画并随机显示一条短语气泡（如 "哎！" "嘿～" 等）。
4. WHILE 宠物处于待机状态，THE 宠物 SHALL 每 60±20 秒随机播放一次"伸懒腰"或"环顾四周"等 idle 动画。
5. THE 宠物 SHALL 支持至少 6 种动画状态：idle、hover、poked、eating、playing、sleeping。

---

### 需求 5：IPC Socket 集成

**用户故事：** 作为开发者，我希望 CLI 工具（Claude Code 等）能实时将输出发送给宠物，以便在桌面上直观看到 AI 正在工作。

#### 验收标准

1. WHEN Daemon 启动，THE Daemon SHALL 在 `$TMPDIR/bitpet.sock` 创建 Unix Domain Socket 并监听。
2. WHEN 外部进程向该 Socket 发送符合协议的 JSON 消息，THE Daemon SHALL 在 500ms 内处理并更新宠物显示。
3. THE Socket 协议 SHALL 支持以下消息类型：
   - `session_start`：开始一个新会话，携带会话名和工具名（如 "claude-code"）
   - `message`：携带文本内容，触发聊天气泡显示
   - `session_end`：会话结束
4. IF Socket 文件已存在但无响应，THEN `bitpet init` SHALL 清理旧 Socket 并重建。
5. THE Socket 服务器 SHALL 支持多个并发连接（最少 5 个），不因单个连接异常而崩溃。

---

### 需求 6：聊天气泡显示

**用户故事：** 作为开发者，我希望实时看到 Claude Code 当前的会话名和模型输出内容以聊天气泡形式显示在宠物旁边，以便直观感知 AI 的工作进展。

#### 验收标准

1. WHEN Daemon 通过 Socket 收到 `message` 类型消息，THE 宠物 SHALL 在其旁边显示带有消息文本的聊天气泡，气泡在 5 秒后自动淡出（或被下一条消息替换）。
2. WHEN 收到 `session_start` 消息，THE 宠物 SHALL 在气泡顶部显示会话名和工具来源（如 "[Claude Code] my-project"），并切换为"活跃工作"动画状态。
3. WHEN 收到 `session_end` 消息，THE 宠物 SHALL 显示简短的完成提示气泡（如 "✅ 完成啦"），并恢复 idle 状态。
4. IF 消息文本超过 100 个字符，THE 气泡 SHALL 截断显示前 100 字符并加 "…" 后缀。
5. THE 聊天气泡 SHALL 使用像素风圆角边框，与宠物整体视觉风格一致，字体可读（最小 12px）。

---

## 边界情况

1. WHEN Daemon 崩溃，THE 宠物窗口 SHALL 自动消失，不留僵尸进程；重新运行 `bitpet init` 可恢复。
2. WHEN 系统睡眠并唤醒，THE 宠物窗口 SHALL 保持可见且位置不变。
3. WHEN 用户连接/断开外接显示器导致屏幕布局变化，THE 宠物 SHALL 自动调整至仍在屏幕可见范围内。
4. WHEN 同一 Socket 上收到消息频率超过 10 条/秒，THE Daemon SHALL 丢弃超出部分，只处理最新一条，不阻塞 UI 线程。

---

## 非功能需求

1. WHEN BitPet Daemon 运行，THE Daemon SHALL 保持 CPU 占用低于 2%（idle 状态），内存低于 80MB。
2. WHEN 用户执行任意 `bitpet` 命令，THE CLI SHALL 在 200ms 内给出响应（不含 Daemon 启动时间）。
3. THE 应用 SHALL 支持 macOS 12（Monterey）及以上版本。
4. THE 安装方式 SHALL 支持通过 `npm install -g bitpet` 或 `pip install bitpet` 安装，或提供单文件可执行包。

---

## 已确认决策

- **宠物形象**：参考截图的圆滚滚像素奇比风格（圆体型、腮红、chibi 比例），保留造型语言，改造为更鲜艳的科技感配色（蓝绿/紫色系），添加数字感细节（如小天线或电路纹路），赋予独立角色身份。设计阶段出具精灵参考图及色板。
- **Hook 配置**：`bitpet init` 不自动写入 hooks。安装完成后，CLI 输出一份详细的手动配置指引，包含 `~/.claude/settings.json` 片段示例，以及 Codex / OpenCode 的等效配置步骤。
- **气泡内容粒度**：显示摘要（截断前 100 字符），以流式方式逐字更新气泡内容，新内容追加或替换当前气泡。
- **技术栈**：由设计阶段分析确定，初步方向为 **Tauri v2（Rust 后端 + TypeScript 前端）**，理由见 design.md 技术选型章节。

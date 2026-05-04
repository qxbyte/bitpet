# 实现计划：BitPet（bitpet）

Spec Type: Feature
Workflow: requirements-first
Status: Tasks Draft
Review Status: confirmed

## 概述

按以下 7 个阶段交付，每阶段结束有检查点。阶段 1–2 建立项目骨架，阶段 3 生成精灵图资产，阶段 4–5 实现核心功能，阶段 6 集成 Claude Code，阶段 7 打包验收。

**仓库结构预览**：
```
bitpet/
├── src-tauri/          # Rust 后端（Daemon）
│   ├── src/
│   │   ├── main.rs
│   │   ├── socket.rs   # IPC Unix Socket 服务器
│   │   ├── state.rs    # 宠物状态机
│   │   └── tray.rs     # 系统托盘（可选）
│   ├── assets/
│   │   └── sprites/    # 精灵图集
│   └── Cargo.toml
├── src/                # TypeScript 前端（Webview）
│   ├── main.ts
│   ├── sprite.ts       # PixelSprite 动画引擎
│   ├── bubble.ts       # BubbleLayer 气泡组件
│   └── index.html
├── cli/                # Node.js CLI（bitpet 命令）
│   ├── index.js
│   └── package.json
├── tools/
│   └── make_sprites.py # 精灵图生成脚本
├── claude-commands/
│   └── pet.md          # Claude Code 斜杠命令定义
└── package.json        # Tauri 前端构建入口
```

---

## 任务

- [x] 1. 项目骨架搭建
  - [ ] 1.1 初始化 Tauri v2 项目
    - 执行 `npm create tauri-app@latest bitpet -- --template vanilla-ts`
    - 配置 `tauri.conf.json`：`transparent: true`、`decorations: false`、`always_on_top: true`、`skip_taskbar: true`
    - 文件：`src-tauri/tauri.conf.json`
    - 验证：`npm run tauri dev` 能打开一个透明无边框窗口
    - _需求：R1.1, R1.2_
  - [ ] 1.2 配置 Cargo 依赖
    - 添加 `tokio`（async runtime）、`serde_json`（JSON 解析）、`tauri`（IPC events）
    - 文件：`src-tauri/Cargo.toml`
    - 验证：`cargo build` 无错误
    - _需求：R5.1_
  - [ ] 1.3 初始化 CLI 包
    - 在 `cli/` 目录创建 `package.json`（name: `bitpet`，bin: `bitpet`）
    - 安装依赖：`net`（内置）
    - 文件：`cli/package.json`、`cli/index.js`（仅骨架）
    - _需求：R3_

- [x] 2. 检查点 —— 项目骨架
  - 运行 `npm run tauri dev`，确认窗口出现
  - 运行 `node cli/index.js --version`，确认 CLI 可执行
  - 如有失败，停止并修复再继续

- [x] 3. 精灵图资产生成
  - [ ] 3.1 编写精灵图生成脚本
    - 输入：`specs/bitpet/Snipaste_2026-05-04_18-42-09.png`（参考原图）
    - 处理流程：
      1. 加载原图，等比缩放至 64×64px
      2. 将棕色系（#8B7355 附近色域）替换为科技蓝配色（主色 #5B8DEF，阴影 #3A5FBF）
      3. 对每种动画状态生成变体帧（位移、缩放、亮度调整）
      4. 将所有帧拼合为横向精灵图集（每帧 64×64，N 帧横排）
    - 文件：`tools/make_sprites.py`
    - 依赖：`Pillow`（`pip install Pillow`）
    - 验证：`python3 tools/make_sprites.py` 输出 `src-tauri/assets/sprites/bitpet.png` 且文件有效
    - _需求：R1.5, R4.5_
  - [ ] 3.2 生成各动画状态帧
    - idle（4帧）：垂直位移 ±2px 模拟呼吸
    - hover（4帧）：整体放大 1.05x，眼睛区域亮度 +30%
    - poked（6帧）：上移 4px → 下移 2px → 回位，圆圈涟漪效果
    - eating（8帧）：下半身缩小/扩大交替（咀嚼），加星星点缀
    - playing（8帧）：左右横向位移 ±8px 循环（跳跃感）
    - sleeping（6帧）：亮度 -20%，闭眼（眼睛区域填充深色）
    - hungry（4帧）：速度减半的 idle + 亮度 -10%
    - active（4帧）：idle 基础上天线区域颜色闪烁（金黄↔白）
    - 文件：`tools/make_sprites.py`（扩展）、`src-tauri/assets/sprites/bitpet.png`
    - _需求：R4.5_
  - [ ] 3.3 生成动画清单文件
    - 输出 `src-tauri/assets/sprites/manifest.json`，格式：
      ```json
      {
        "frameWidth": 64,
        "frameHeight": 64,
        "animations": {
          "idle":     { "start": 0,  "end": 3,  "fps": 4 },
          "hover":    { "start": 4,  "end": 7,  "fps": 8 },
          "poked":    { "start": 8,  "end": 13, "fps": 10 },
          "eating":   { "start": 14, "end": 21, "fps": 10 },
          "playing":  { "start": 22, "end": 29, "fps": 12 },
          "sleeping": { "start": 30, "end": 35, "fps": 3  },
          "hungry":   { "start": 36, "end": 39, "fps": 4  },
          "active":   { "start": 40, "end": 43, "fps": 8  }
        }
      }
      ```
    - _需求：R4.5_

- [x] 4. 检查点 —— 精灵图资产
  - 运行 `python3 tools/make_sprites.py`，检查 `src-tauri/assets/sprites/bitpet.png` 存在
  - 用图片查看器打开，确认能看到各帧精灵（蓝色调小精灵）
  - 如颜色替换效果不理想，调整 `make_sprites.py` 中的色域阈值

- [x] 5. Rust 后端实现
  - [ ] 5.1 实现 `StateManager`
    - 状态结构体：`PetState { hunger, mood, energy, position, last_active }`
    - 读写 `~/.config/bitpet/state.json`（创建目录若不存在）
    - 衰减定时器：tokio interval 30 分钟，hunger +10，energy -5，clamp(0,100)
    - 文件：`src-tauri/src/state.rs`
    - 验证：单元测试覆盖衰减边界（hunger=95 → 100 而非 105）
    - _需求：R2.1, R2.2, R2.5_
  - [ ] 5.2 实现 `SocketServer`
    - 监听 `$TMPDIR/bitpet.sock`（`std::env::temp_dir()`）
    - tokio::net::UnixListener 接收连接，每连接独立 task
    - 解析 JSON：`session_start` / `message` / `session_end` / `cmd`
    - `cmd` 消息：调用 StateManager，返回 JSON 响应
    - 速率限制：每连接 ≤10 条/秒，超出丢弃
    - Socket 文件权限：0600
    - 文件：`src-tauri/src/socket.rs`
    - 验证：集成测试用 Node.js 脚本连接 Socket，发送 `{"type":"cmd","action":"status"}`，收到 `{"ok":true,...}`
    - _需求：R5.1–R5.5_
  - [ ] 5.3 接入 Tauri Events
    - `socket.rs` 接收到消息后，通过 `app_handle.emit_all()` 发送 Tauri 事件至前端：
      - `bubble:delta`、`bubble:session_start`、`bubble:session_end`、`state:update`
    - 文件：`src-tauri/src/main.rs`（注册 socket 线程，传入 AppHandle）
    - _需求：R6.1–R6.3_
  - [ ] 5.4 窗口位置持久化与屏幕边界检测
    - 窗口拖拽结束时，记录位置到 `state.json`
    - Daemon 启动时恢复上次位置
    - 监听屏幕参数变化（`NSApplicationDidChangeScreenParametersNotification` via Tauri plugin-macos），重新 clamp 位置至屏幕内
    - 文件：`src-tauri/src/main.rs`
    - _需求：R1.3, 边界情况 3_

- [x] 6. 检查点 —— Rust 后端
  - `cargo test` 全部通过
  - 手动：`npm run tauri dev` 启动后，用 `nc -U $TMPDIR/bitpet.sock` 发送 `{"type":"cmd","action":"status"}` 能收到响应

- [x] 7. TypeScript 前端实现
  - [ ] 7.1 实现 `PixelSprite`（Canvas 2D 动画引擎）
    - 加载 `bitpet.png` 和 `manifest.json`
    - `requestAnimationFrame` 驱动帧计数，按 fps 切帧
    - `setState(name)` 方法切换动画状态，支持 transition（当前帧播完后切换）
    - Canvas 尺寸 128×128（2x 缩放，像素感更清晰）
    - 文件：`src/sprite.ts`
    - _需求：R4.5_
  - [ ] 7.2 实现 `BubbleLayer`（聊天气泡）
    - 监听 Tauri 事件 `bubble:delta`：追加文字，超 100 字符时截断头部加 "…"
    - 监听 `bubble:session_start`：在气泡顶部显示 `[工具名] 会话名`
    - 监听 `bubble:session_end`：显示 "✅ 完成啦"，3 秒后淡出
    - 气泡样式：像素风圆角边框（border 2px solid，CSS `image-rendering: pixelated`），最小字体 12px
    - 文件：`src/bubble.ts`
    - _需求：R6.1–R6.5_
  - [ ] 7.3 鼠标交互事件
    - `mouseenter`：调用 `sprite.setState('hover')`
    - `mouseleave`：1 秒后调用 `sprite.setState('idle')`（若无其他状态）
    - `click`：调用 `sprite.setState('poked')`，随机显示短语气泡（"哎！" "嘿～" "别戳了！" 等 8 条）
    - 文件：`src/main.ts`
    - _需求：R4.1–R4.3_
  - [ ] 7.4 监听 `state:update` 事件，根据 hunger/energy 自动切换饥饿/睡眠动画
    - hunger ≥ 80 → `sprite.setState('hungry')`
    - energy ≤ 20 → `sprite.setState('sleeping')`
    - 文件：`src/main.ts`
    - _需求：R2.3, R2.4_
  - [ ] 7.5 Idle 随机动画定时器
    - 每 60±20 秒（`Math.random()*40 + 40` 秒）随机播放一次 idle 变体
    - 文件：`src/main.ts`
    - _需求：R4.4_

- [ ] 8. 检查点 —— 前端 UI
  - `npm run tauri dev`，确认精灵动画播放正常（蓝色小精灵在窗口内动）
  - 鼠标 hover 切换动画
  - 点击弹出随机短语气泡

- [x] 9. CLI 实现（Node.js）
  - [ ] 9.1 实现 Socket 客户端基础
    - 连接 `$TMPDIR/bitpet.sock`，发送 JSON，等待响应，打印结果
    - 若 Socket 不存在，提示 "请先运行 /pet init"
    - 文件：`cli/index.js`
    - _需求：R3.6_
  - [ ] 9.2 实现各子命令
    - `init`：检测 Socket 是否存在 → 不存在则 `spawn` Tauri Daemon 进程（后台） → 轮询 Socket 最多 5 秒等待就绪 → 输出 "BitPet 已启动 🐾"
    - `feed` / `play` / `stop`：发送对应 cmd 消息
    - `status`：发送 status cmd，格式化输出（含 emoji 状态描述）
    - 文件：`cli/index.js`
    - 验证：`node cli/index.js status` 输出格式正确
    - _需求：R3.1–R3.5_
  - [ ] 9.3 实现 `setup-hooks` 子命令
    - `bitpet setup-hooks --tool claude`：在终端输出完整配置步骤（Claude Code `settings.json` 片段）
    - `bitpet setup-hooks --tool codex`：输出 Codex hooks 配置步骤
    - `bitpet setup-hooks --tool opencode`：输出 OpenCode hooks 配置步骤
    - 文件：`cli/index.js`（`cli/hooks-guide.js` 存放模板文本）
    - _需求：R5，已确认追加决策_
  - [ ] 9.4 安装 `bitpet-hook` 辅助脚本
    - `cli/bitpet-hook.js`：接收 CLI 工具输出，格式化为 Socket JSON，发送给 Daemon
    - 参数：`bitpet-hook <tool-name> [delta-text]` 或 `bitpet-hook session-end <tool-name>`
    - 文件：`cli/bitpet-hook.js`
    - _需求：R5.2, R5.3_

- [ ] 10. 检查点 —— CLI
  - `node cli/index.js init` 启动 Daemon，窗口出现
  - `node cli/index.js feed` 触发进食动画
  - `node cli/index.js status` 输出状态

- [x] 11. Claude Code 斜杠命令集成
  - [ ] 11.1 创建斜杠命令文件
    - 文件：`claude-commands/pet.md`
    - 内容：
      ```markdown
      ---
      description: 控制 BitPet 桌面宠物（init/feed/play/status/stop）
      ---
      !bitpet $ARGUMENTS
      ```
    - _需求：R3（启动入口）_
  - [ ] 11.2 提供安装脚本
    - `bitpet init` 执行后自动将 `claude-commands/pet.md` 复制到 `~/.claude/commands/pet.md`
    - 若文件已存在，跳过并提示
    - 文件：`cli/index.js`（init 子命令扩展）
    - 验证：`/pet status` 在 Claude Code 会话中输出宠物状态
    - _需求：R3_
  - [ ] 11.3 安装 Claude Code Hooks（通过 `setup-hooks`）
    - `bitpet setup-hooks --tool claude` 输出的配置中：
      - `PostToolUse` hook：调用 `bitpet-hook claude-code "$CLAUDE_TOOL_OUTPUT"`（发送 message delta）
      - `Stop` hook：调用 `bitpet-hook session-end claude-code`
      - `PreToolUse` 或 session 识别：通过 `CLAUDE_SESSION_ID` 或首次 hook 触发时发送 `session_start`
    - 文件：`cli/hooks-guide.js`（配置模板）
    - _需求：R5, R6_

- [ ] 12. 检查点 —— 端到端集成
  - 在 Claude Code 会话中执行 `/pet init`，宠物窗口出现
  - 执行 `/pet feed`，宠物播放进食动画
  - 按照 `bitpet setup-hooks --tool claude` 输出的步骤配置 hooks
  - 在 Claude Code 中提问，观察宠物切换为 active 状态，气泡逐字显示输出摘要
  - 回答完成后，宠物显示 "✅ 完成啦" 并恢复 idle

- [*] 13. （可选）npm 发布准备
  - [ ] 13.1 配置根 `package.json`，将 Tauri 构建和 CLI 打包为统一安装流程
  - [ ] 13.2 编写 `README.md`（安装步骤、快速开始、hooks 配置）
  - [ ] 13.3 测试 `npm install -g .` 全流程
  - _需求：NFR4（可选）_

---

## 验收

- [ ] 所有 required 任务（1–12）完成。
- [ ] `cargo test` 通过（StateManager 单元测试）。
- [ ] 手动验收 12 个检查点场景全部通过。
- [ ] 宠物窗口 CPU idle < 2%（Activity Monitor 观察 30 秒）。
- [ ] 未完成的 optional 任务（13）已记录。
- [ ] 用户确认验收。

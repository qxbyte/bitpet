# BitPet

一只住在你桌面上的像素宠物，陪你写代码。

它通过本地 IPC Socket 与 Claude Code 等 AI 编程工具实时通信——当你按下回车，它会进入思考状态；当工具运行时，它的气泡会显示当前进度；当任务完成，它回到闲置状态等着你。

---

## 系统要求

- macOS 12 (Monterey) 及以上
- Node.js 18 及以上
- 如需从源码构建：Rust 工具链（`rustup`）+ Xcode Command Line Tools

---

## 安装

### 方式一：npm（推荐）

```bash
npm install -g bitpet
```

自动完成：下载并安装 `BitPet.app` + 注册 `bitpet` / `bitpet-hook` 命令。

**更新：**

```bash
npm update -g bitpet
```

一条命令同步更新 CLI 和桌面应用。

---

### 方式二：手动安装 DMG

从 [Releases](https://github.com/qxbyte/bitpet/releases) 下载对应架构的 DMG：

| 文件 | 适用机型 |
|---|---|
| `BitPet_x.x.x_aarch64.dmg` | Apple Silicon（M1/M2/M3/M4） |
| `BitPet_x.x.x_x64.dmg` | Intel Mac |

打开 DMG，将 `BitPet.app` 拖入 `/Applications`，然后安装 CLI：

```bash
npm install -g bitpet --ignore-scripts   # 只装 CLI，跳过 app 下载
```

首次打开若提示"已损坏，无法打开"（Gatekeeper 对未签名 app 的拦截），运行：

```bash
xattr -cr /Applications/BitPet.app
```

> **注意**：git clone 只能获取源代码，无法直接安装 app。app 需要通过 DMG 或 `npm install -g bitpet` 安装。开发者可用 `npm run build` 从源码编译。

---

### 方式二：从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/qxbyte/bitpet.git
cd bitpet

# 2. 安装前端依赖
npm install

# 3. 构建（约 3–5 分钟）
npm run build

# 4. 安装 CLI
cd cli && npm install -g . && cd ..
```

构建产物位于：
- App Bundle：`src-tauri/target/release/bundle/macos/BitPet.app`
- DMG：`src-tauri/target/release/bundle/dmg/BitPet_x.x.x_aarch64.dmg`

---

## 启动与基本使用

### 启动宠物

```bash
bitpet init
```

首次启动会：
- 在桌面右下角（Dock 上方）显示宠物窗口
- 播放启动动画
- 在 `~/.config/bitpet/state.json` 创建状态文件

宠物窗口透明无边框，始终悬浮在所有窗口最上方。

---

### 日常命令

```bash
bitpet feed      # 喂食：饥饿度 -30，心情 +20，精力 +30
bitpet play      # 玩耍：心情 +15，精力 -10
bitpet sleep     # 睡觉：触发睡眠动画，精力至少保底 30
bitpet status    # 查看当前状态（饥饿度/心情/精力）
bitpet stop      # 关闭宠物，保存状态
```

**状态示例：**

```
  🐾 BitPet 状态
  ─────────────────
  🍽️  吃饱了        饥饿度 15/100
  😄 心情极好       心情   88/100
  ⚡ 精力充沛       精力   90/100
```

---

### 鼠标互动

| 操作 | 效果 |
|---|---|
| **点击**宠物 | 播放被戳动画，随机显示一句俏皮话 |
| **拖拽**宠物 | 移动到桌面任意位置（重启后恢复） |

---

## 与 Claude Code 集成

这是 BitPet 的核心功能：让宠物实时响应你的 AI 编程会话。

### 集成后的效果

| 时机 | 宠物状态 |
|---|---|
| 你按下回车发送消息 | 进入**思考动画** |
| 每个工具调用开始 | 气泡显示当前工具名，持续思考 |
| 工具执行完毕，模型处理结果 | 切换为**活跃动画**，气泡显示输出摘要 |
| 模型回复完成 | 显示 ✅ 完成啦，恢复**闲置动画** |

### 配置步骤

`bitpet init` 会自动完成配置，无需手动操作。启动宠物后，重新打开一个 Claude Code 会话即可生效。

如果动画没有反应，运行以下命令重新写入 hooks：

```bash
bitpet hooks
```

然后重新打开 Claude Code 会话。

---

## 宠物状态说明

### 数值字段

| 字段 | 初始值 | 范围 | 说明 |
|---|---|---|---|
| `hunger` | 20 | 0–100 | 越高越饿 |
| `mood` | 80 | 0–100 | 越高越开心 |
| `energy` | 90 | 0–100 | 越高越精神 |

---

### 自动衰减（每 6 分钟一次）

- `hunger` +10（上限 100）→ 从 20 开始，约 1 小时涨满至 100
- `energy` -1（下限 0）→ 从 90 开始，约 9 小时耗尽
- `mood` 不变

---

### 命令效果

**喂食（`bitpet feed`）**
- `hunger` -30（下限 0）
- `mood` +20（上限 100）
- `energy` +30（上限 100）

**玩耍（`bitpet play`）**
- `mood` +15（上限 100）
- `energy` -10（下限 0）
- `hunger` 不变

**睡觉（`bitpet sleep`）**
- `hunger` 强制设为 100（触发睡眠动画）
- `energy` 取 max(当前值, 30)——仅保底 30，不做完全恢复
- `mood` 不变

---

### 动画状态触发规则

优先级从高到低：

1. **deep_sleep**：`energy` ≤ 20
2. **sleeping**：`hunger` ≥ 100（且 `energy` > 20）
3. **idle**：`hunger` < 100 且从 sleeping/deep_sleep 状态唤醒

> `mood` 字段在当前版本中不触发任何动画，仅作为数值记录。

---

### 关键边界行为

- `sleep` 命令会把 `hunger` 设成 100，主动触发 sleeping 动画；再喂食后 `hunger` 降到 100 以下，宠物才会醒来。
- `energy` ≤ 20 时 deep_sleep 优先于 sleeping，且此状态不可被 `hunger` < 100 唤醒——需要先通过 `bitpet feed` 将 `energy` 恢复到 20 以上（当前没有自动恢复 `energy` 的机制）。
- `mood` 有 `.min(100)` 保护，实际不会溢出。

> 提示：养成每隔几小时 `bitpet feed` 的习惯，宠物会一直保持活泼状态。

---

## 在 Claude Code 中使用 /pet 命令

安装完成后，可以在 Claude Code 内直接输入斜杠命令控制宠物（无需切换终端窗口）：

```
/pet init      启动宠物
/pet feed      喂食
/pet play      玩耍
/pet status    查看状态
/pet stop      关闭宠物
```

首次运行 `bitpet init` 时会自动注册 `/pet` 命令到 `~/.claude/commands/pet.md`。

---

## 其他工具集成

### Codex

```bash
bitpet setup-hooks --tool codex
```

### OpenCode

```bash
bitpet setup-hooks --tool opencode
```

---

## 常见问题

**宠物窗口不显示？**

```bash
# 检查是否已运行
bitpet status

# 如果未运行，重新启动
bitpet init
```

**宠物卡在某个动画状态不动？**

通常是 BitPet 进程异常。重启即可：

```bash
bitpet stop
bitpet init
```

**`bitpet` 命令找不到？**

确认 CLI 已全局安装：

```bash
cd bitpet/cli
npm install -g .
```

**macOS 提示"无法验证开发者"？**

首次打开 `.app` 时，在 Finder 中右键点击 `BitPet.app` → 选择「打开」→ 在弹窗中点「打开」。之后双击正常打开。

或通过终端解除隔离：

```bash
xattr -dr com.apple.quarantine /Applications/BitPet.app
```

**Claude Code 集成后宠物没有反应？**

1. 确认宠物正在运行：`bitpet status`
2. 重新写入 hooks：`bitpet hooks`
3. 确认 `bitpet-hook` 在 PATH 中：`which bitpet-hook`
4. 重新打开 Claude Code 会话使 hooks 生效

---

## 开发者构建（开发模式）

```bash
# 启动开发服务器（热重载）
npm run dev

# 仅构建前端
npm run vite:build

# 仅检查 Rust 代码
cargo check --manifest-path src-tauri/Cargo.toml
```

开发模式下，Vite 开发服务器运行在 `http://localhost:1420`，Tauri 会自动连接。

---

## 许可证

MIT

# BitPet

一只住在你桌面上的像素宠物，陪你写代码。

它通过本地 IPC Socket 与 Claude Code 等 AI 编程工具实时通信——当你按下回车，它会进入思考状态；当工具运行时，它的气泡会显示当前进度；当任务完成，它回到闲置状态等着你。

---

## 系统要求

- macOS 12 (Monterey) 及以上
- Windows 10/11 x64（需要 Microsoft Edge WebView2 Runtime，通常系统已内置）
- Node.js 18 及以上
- 如需从源码构建：
  - macOS：Rust 工具链（`rustup`）+ Xcode Command Line Tools
  - Windows：Rust 工具链（`rustup`）+ Microsoft C++ Build Tools

---

## 快速安装

### 一键安装 App + CLI（推荐）

通过 npm 安装全局 CLI，同时自动下载同版本桌面应用：

- macOS：安装 `BitPet.app` 到 `/Applications`（无权限时回退到 `~/Applications`）
- Windows：安装同版本 Windows 桌面应用

```bash
npm install -g bitpet
```

安装完成后会得到：

- 桌面应用：macOS 为 `BitPet.app`，Windows 为 `BitPet.exe`
- 命令行工具：`bitpet`
- AI 工具 hook 命令：`bitpet-hook`

快速验证：

```bash
bitpet --version
which bitpet
which bitpet-hook
```

Windows PowerShell 使用：

```powershell
bitpet --version
where bitpet
where bitpet-hook
```

启动桌面宠物：

```bash
bitpet init
```

如果 npm 安装时网络中断或 GitHub Release 资产还没生成，可能只安装了 CLI、没有装上桌面应用。这时不用重新发布包，直接重新安装 App：

```bash
bitpet install-app
bitpet init
```

**更新：**

```bash
npm update -g bitpet
```

`bitpet` npm 包、CLI 和桌面应用使用同一个版本号。每次 GitHub Release 发布新版本后，npm 安装脚本会下载匹配平台的发布产物，因此一条命令即可同步更新 CLI 和桌面应用。

---

### 只安装 CLI，不自动安装 App

如果你只想安装命令行工具，或者已经手动安装了桌面应用：

```bash
npm install -g bitpet --ignore-scripts
```

之后仍可使用：

```bash
bitpet --version
bitpet status
```

> `--ignore-scripts` 会跳过自动下载和安装桌面应用的步骤。
> 如需之后补装桌面应用，运行 `bitpet install-app`。

---

### 手动安装 App（macOS DMG）

从 [Releases](https://github.com/qxbyte/bitpet/releases) 下载对应架构的 DMG：

| 文件 | 适用机型 |
|---|---|
| `BitPet_x.x.x_aarch64.dmg` | Apple Silicon（M1/M2/M3/M4） |
| `BitPet_x.x.x_x64.dmg` | Intel Mac |

打开 DMG，将 `BitPet.app` 拖入 `/Applications`。如果还需要 CLI，再运行：

```bash
npm install -g bitpet --ignore-scripts   # 只装 CLI，跳过 app 下载
```

首次打开若提示"已损坏，无法打开"（Gatekeeper 对未签名 app 的拦截），运行：

```bash
xattr -cr /Applications/BitPet.app
```

如果你把 App 放在用户目录，则使用：

```bash
xattr -cr ~/Applications/BitPet.app
```

> **注意**：git clone 只能获取源代码，无法直接安装 app。app 需要通过 DMG 或 `npm install -g bitpet` 安装。开发者可用 `npm run build` 从源码编译。

---

### 手动安装 App（Windows）

从 [Releases](https://github.com/qxbyte/bitpet/releases) 下载同版本 Windows 安装包：

| 文件 | 适用系统 |
|---|---|
| `BitPet_x.x.x_x64-setup.exe` | Windows 10/11 x64 |

运行安装包后，再安装 CLI：

```powershell
npm install -g bitpet --ignore-scripts
bitpet init
```

如果 `bitpet init` 提示找不到桌面应用，先运行：

```powershell
bitpet install-app
bitpet init
```

---

### 从源码构建

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
- macOS App Bundle：`src-tauri/target/release/bundle/macos/BitPet.app`
- macOS DMG：`src-tauri/target/release/bundle/dmg/BitPet_x.x.x_aarch64.dmg`
- Windows NSIS 安装包：`src-tauri/target/release/bundle/nsis/BitPet_x.x.x_x64-setup.exe`

---

## 启动与基本使用

### 启动宠物

```bash
bitpet init
```

首次启动会：
- 在桌面右下角显示宠物窗口（macOS 位于 Dock 上方，Windows 位于任务栏上方）
- 播放启动动画
- 创建状态文件：macOS 为 `~/.config/bitpet/state.json`，Windows 为 `%APPDATA%\bitpet\state.json`

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

- `hunger` +5（上限 100）→ 从 20 开始，约 96 分钟涨满至 100
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

确认 CLI 已全局安装，并检查 npm 全局 bin 是否在 `PATH` 中：

```bash
npm install -g bitpet --ignore-scripts
which bitpet
echo "$(npm prefix -g)/bin"
```

Windows PowerShell 使用：

```powershell
npm install -g bitpet --ignore-scripts
where bitpet
npm prefix -g
```

如果 `which bitpet` 没有输出，把 `echo "$(npm prefix -g)/bin"` 显示的目录加入 shell 的 `PATH`。
如果 `where bitpet` 没有输出，把 npm 全局 bin 目录加入用户 `PATH`。

**`bitpet init` 提示找不到 BitPet 可执行文件？**

通常是 npm postinstall 没能完成 App 下载或安装。先补装 App：

```bash
bitpet install-app
bitpet init
```

如果仍失败，macOS 到 [Releases](https://github.com/qxbyte/bitpet/releases/latest) 下载同版本 DMG，拖入 `/Applications` 或 `~/Applications` 后再运行 `bitpet init`；Windows 下载同版本 `BitPet_x.x.x_x64-setup.exe` 并安装后再运行 `bitpet init`。

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

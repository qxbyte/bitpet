'use strict'

const GUIDES = {
  claude: `
╔══════════════════════════════════════════════════════╗
║         BitPet × Claude Code  配置指引              ║
╚══════════════════════════════════════════════════════╝

步骤 1 — 打开（或创建）文件：
  ~/.claude/settings.json

步骤 2 — 添加以下 hooks 配置（合并到现有 "hooks" 字段中）：

  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bitpet-hook message claude-code \\"$CLAUDE_TOOL_RESPONSE\\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bitpet-hook session-end claude-code"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bitpet-hook session-start claude-code \\"$CLAUDE_SESSION_ID\\""
          }
        ]
      }
    ]
  }

步骤 3 — 保存文件，新开一个 Claude Code 会话：
  claude

步骤 4 — 验证：
  在 Claude Code 中发送任意消息，观察宠物是否
  切换为"active"状态并在气泡中显示输出摘要。

提示：若 settings.json 已有 hooks 字段，请手动合并
      不要直接覆盖整个 hooks 块。
`,

  codex: `
╔══════════════════════════════════════════════════════╗
║           BitPet × Codex  配置指引                  ║
╚══════════════════════════════════════════════════════╝

Codex 支持通过环境变量或配置文件设置 hooks。
请参考 Codex 官方文档中关于 "exec hooks" 的部分，
将以下命令注册为输出事件回调：

  输出事件：  bitpet-hook message codex "<output>"
  结束事件：  bitpet-hook session-end codex
  启动事件：  bitpet-hook session-start codex "<session>"

bitpet-hook 脚本已随 bitpet 一同安装在 PATH 中。
`,

  opencode: `
╔══════════════════════════════════════════════════════╗
║         BitPet × OpenCode  配置指引                 ║
╚══════════════════════════════════════════════════════╝

OpenCode 支持通过 ~/.opencode/config.json 配置 hooks。
请添加以下内容：

  "hooks": {
    "on_message": "bitpet-hook message opencode \\"$OPENCODE_OUTPUT\\"",
    "on_stop":    "bitpet-hook session-end opencode",
    "on_start":   "bitpet-hook session-start opencode \\"$OPENCODE_SESSION\\""
  }

bitpet-hook 脚本已随 bitpet 一同安装在 PATH 中。
`,
}

module.exports = { GUIDES }

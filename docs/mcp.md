# Pibo MCP

`pibo mcp` is the local operator CLI for external MCP servers. It is intentionally separate from the pibo plugin runtime: MCP servers are configured in `mcp_servers.json`, started as external stdio or HTTP servers, and called from the shell.

This keeps pibo small. Optional tools can be added when needed without becoming npm dependencies of the core package.

## Commands

```bash
npm run dev -- mcp
npm run dev -- mcp info <server>
npm run dev -- mcp info <server> <tool>
npm run dev -- mcp grep "<pattern>"
npm run dev -- mcp call <server> <tool> '<json>'
```

The CLI accepts both space-separated and slash-separated server/tool targets:

```bash
npm run dev -- mcp info browser-use browser_get_state
npm run dev -- mcp info browser-use/browser_get_state
```

## Config

MCP server definitions live in `mcp_servers.json`. The file is local and ignored by git because it can contain absolute paths and machine-specific environment variables.

Lookup order:

1. `-c/--config <path>`
2. `MCP_CONFIG_PATH`
3. `./mcp_servers.json`
4. `~/.mcp_servers.json`
5. `~/.config/mcp/mcp_servers.json`

Manage the file with:

```bash
npm run dev -- mcp config init
npm run dev -- mcp config show
npm run dev -- mcp config add filesystem '{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","."]}'
npm run dev -- mcp config remove filesystem
```

## Registry

The registry is a curated list of optional MCP server presets. Presets are not active by default. Installing one writes a normal `mcpServers` entry, so the runtime path is the same as a manually added server.

```bash
npm run dev -- mcp registry list
npm run dev -- mcp registry show browser-use
npm run dev -- mcp registry doctor browser-use
npm run dev -- mcp registry install browser-use
npm run dev -- mcp registry remove browser-use
```

Python-based presets are installed into isolated virtual environments:

```text
~/.pibo/mcp-tools/<name>/.venv
```

Pibo does not install Python tools during `npm install`. Runtime setup happens only when a registry preset is installed.

## Browser Use

The first registry preset is `browser-use`. Browser Use provides browser automation through an MCP server. Pibo installs it on demand into:

```text
~/.pibo/mcp-tools/browser-use/.venv
```

Install:

```bash
npm run dev -- mcp registry install browser-use
```

Inspect tools:

```bash
npm run dev -- mcp info browser-use
```

Try direct browser control:

```bash
npm run dev -- mcp call browser-use browser_navigate '{"url":"https://example.com"}'
npm run dev -- mcp call browser-use browser_get_state '{"include_screenshot":false}'
```

The default install is headless, which works well on VPS and server environments:

```json
{
  "env": {
    "BROWSER_USE_HEADLESS": "true"
  }
}
```

For a visible local browser:

```bash
npm run dev -- mcp registry install browser-use --headful
```

On Linux, pibo checks whether a graphical display is usable. If no display is found, pibo prints a warning and falls back to headless mode instead of writing a broken headful config.

## Requirements

Registry installation requires `uv` on `PATH`. The doctor command reports missing prerequisites:

```bash
npm run dev -- mcp registry doctor browser-use
```

If `uv` is missing:

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows PowerShell
irm https://astral.sh/uv/install.ps1 | iex
```

If Python is missing:

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y python3 python3-venv

# macOS
brew install python

# Windows PowerShell
winget install Python.Python.3.12
```

## Model Provider Notes

Direct Browser Use MCP tools such as `browser_navigate`, `browser_get_state`, `browser_click`, and `browser_screenshot` do not need a model provider.

Agentic Browser Use tools, especially `retry_with_browser_use_agent`, need a valid model provider/API key in the Browser Use MCP server environment. Pibo does not yet copy credentials from the main Pi Coding Agent configuration into MCP server env. That should stay explicit until provider ownership is designed.

## Daemon

The MCP CLI keeps stdio connections warm through a local daemon for faster repeated calls. Disable it with:

```bash
MCP_NO_DAEMON=1 npm run dev -- mcp call browser-use browser_get_state '{}'
```

Useful environment variables:

```text
MCP_NO_DAEMON=1
MCP_DAEMON_TIMEOUT=60
MCP_DAEMON_REQUEST_TIMEOUT=60
MCP_TIMEOUT=1800
```

The daemon is a local cache for MCP connections. It does not make MCP servers part of the pibo plugin runtime.

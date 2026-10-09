#!/usr/bin/env bash
# Bootstrap dotfiles on a new machine using GNU Stow.
# Usage: ./bootstrap.sh
set -euo pipefail

cd "$(dirname "$0")"

# ~/.pi must be a real directory (pi writes auth.json, sessions/ etc. there).
# Pre-create it so stow descends into it instead of folding ~/.pi into a symlink.
mkdir -p "$HOME/.pi/agent"

packages=(zsh tmux vim dev config pi claude)

for pkg in "${packages[@]}"; do
  echo "stow $pkg"
  stow --target="$HOME" "$pkg"
done

echo "done. reminders:"
echo "  - dconf.ini     -> dconf load / < dconf.ini"
echo "  - secrets       -> create ~/.pi/env with MCP tokens (see pi/.pi/agent/mcp.json)"

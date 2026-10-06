export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin:$HOME/bin:$HOME/.local/bin:$HOME/.tfenv/bin
if [[ $OSTYPE == linux* ]]; then
  linux=true
else
  linux=false
fi

# Set history file
export HISTFILE=~/.zsh_history
export HISTSIZE=10000
export SAVEHIST=$HISTSIZE

# History command configuration
setopt extended_history       # record timestamp of command in HISTFILE
setopt hist_expire_dups_first # delete duplicates first when HISTFILE size exceeds HISTSIZE
setopt hist_ignore_dups       # ignore duplicated commands history list
setopt hist_ignore_space      # ignore commands that start with space
setopt hist_verify            # show command with history expansion to user before running it
setopt inc_append_history     # write command to history file immediately mutually exclusive with share_history
# setopt share_history          # share command history data

# Fix less
export LESS="-R+X"

autoload -Uz compinit && compinit
autoload -U +X bashcompinit && bashcompinit

# emacs keybindings for zsh
bindkey -e

# ctrl+arrow for forward/backward
bindkey "^[[1;5C" forward-word
bindkey "^[[1;5D" backward-word

# delete to del char
bindkey "^[[3~" delete-char

# Starship
eval "$(starship init zsh)"

# fnm
if [ -x "$(command -v fnm)" ]; then
  export PATH=$HOME/.fnm:$PATH
  eval "$(fnm env --use-on-cd)"
fi

# kubectl completion: spawning kubectl can trigger the gke exec auth plugin
# (multi-second token mint when network is slow), so cache the static output
# and regenerate only when the binary is newer than the cache
if (( $+commands[kubectl] )); then
  _kc_cache="$HOME/.cache/zsh/kubectl-completion.zsh"
  _kc_bin="${commands[kubectl]}"
  if [[ ! -s "$_kc_cache" || "$_kc_cache" -ot "$_kc_bin" ]]; then
    mkdir -p "$_kc_cache:h"
    ( kubectl completion zsh >| "$_kc_cache.new" && mv "$_kc_cache.new" "$_kc_cache" ) &!
  fi
  [[ -s "$_kc_cache" ]] && source "$_kc_cache"
  unset _kc_cache _kc_bin
fi

# AWS CLI
# complete -C '/usr/local/bin/aws_completer' aws

alias vim='nvim'
export EDITOR='nvim'

kind_podman() {
  export KIND_EXPERIMENTAL_PROVIDER=podman
}

if [[ "$linux" == true ]]; then
  source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh
else
  source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
fi

# Load work configuration
if [ -f $HOME/.work.zshrc ]; then
  source $HOME/.work.zshrc
fi

# Aliases
alias open='xdg-open'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias -- -= 'cd -'

# omp bails out of ~ by default; interactive shells usually start here
alias omp='omp --allow-home'

# load docker completions
if [[ -x "$(command -v docker)" ]]; then
  source <(docker completion zsh)
fi

if [[ $linux == "true" ]] && [[ -x "$(command -v gcloud)" ]]; then
  source /usr/share/google-cloud-sdk/completion.zsh.inc
fi


alias k=kubectl

# bun completions
[ -s "/home/charles/.bun/_bun" ] && source "/home/charles/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# gcloud: allow its bundled python to see user site-packages (numpy for IAP tunnels)
export CLOUDSDK_PYTHON_SITEPACKAGES=1
export CLOUDSDK_PYTHON=$(which python)

# pi MCP tokens (secrets live in ~/.pi/env, not in the dotfiles repo)
[ -f ~/.pi/env ] && source ~/.pi/env

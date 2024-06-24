export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin:$HOME/bin:$HOME/.local/bin:$HOME/.tfenv/bin
local linux=false
if [[ $(uname -s) == "Linux" ]]; then
  linux=true
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
setopt share_history          # share command history data

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
  eval "$(fnm env)"
fi

# Load kubectl completions if command exists
if [ -x "$(command -v kubectl)" ]; then
  source <(kubectl completion zsh)
fi

# AWS CLI
complete -C '/usr/local/bin/aws_completer' aws

alias vim='nvim'
export EDITOR=vim

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
alias -- -='cd -'

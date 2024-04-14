export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin:$HOME/bin:$HOME/.local/bin:$HOME/.tfenv/bin
local linux=false
if [[ $(uname -s) == "Linux" ]]; then
  linux=true
fi

# Set history file
HISTFILE=~/.zsh_history

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


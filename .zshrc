export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin:$HOME/bin:$HOME/.local/bin

autoload -Uz compinit
compinit

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

# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="robbyrussell"
plugins=(git kube-ps1 kubectl aws)
source $ZSH/oh-my-zsh.sh

export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin:$HOME/bin:$HOME/.local/bin

# fnm
export PATH=$HOME/.fnm:$PATH
eval "`fnm env`"

# kube-ps1 config
function get_cluster_short() {
  echo "$1" | cut -d - -f2-
}
KUBE_PS1_CLUSTER_FUNCTION=get_cluster_short
KUBE_PS1_SEPARATOR=' '
KUBE_PS1_NS_ENABLE=false
KUBE_PS1_SYMBOL_USE_IMG=true
KUBE_PS1_SYMBOL_COLOR=cyan
KUBE_PS1_PREFIX_COLOR=cyan
KUBE_PS1_SUFFIX_COLOR=cyan
KUBE_PS1_SUFFIX=') '
PROMPT=$PROMPT'$(kube_ps1)'

# AWS CLI
complete -C '/usr/local/bin/aws_completer' aws

alias vim='nvim'
export EDITOR=vim

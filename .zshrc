# zmodload zsh/zprof
# If you come from bash you might have to change your $PATH.
# export PATH=$HOME/bin:/usr/local/bin:$PATH

# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load --- if set to "random", it will
# load a random theme each time oh-my-zsh is loaded, in which case,
# to know which specific one was loaded, run: echo $RANDOM_THEME
# See https://github.com/robbyrussell/oh-my-zsh/wiki/Themes
ZSH_THEME="robbyrussell"

# Set list of themes to pick from when loading at random
# Setting this variable when ZSH_THEME=random will cause zsh to load
# a theme from this variable instead of looking in ~/.oh-my-zsh/themes/
# If set to an empty array, this variable will have no effect.
# ZSH_THEME_RANDOM_CANDIDATES=( "robbyrussell" "agnoster" )

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion.
# Case-sensitive completion must be off. _ and - will be interchangeable.
# HYPHEN_INSENSITIVE="true"

# Uncomment the following line to disable bi-weekly auto-update checks.
# DISABLE_AUTO_UPDATE="true"

# Uncomment the following line to change how often to auto-update (in days).
# export UPDATE_ZSH_DAYS=13

# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
#COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# You can set one of the optional three formats:
# "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# or set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
# HIST_STAMPS="mm/dd/yyyy"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load?
# Standard plugins can be found in ~/.oh-my-zsh/plugins/*
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
#
plugins=(
  #git
  # docker
  #kubectl
  # golang
  # npm
  #zsh-completions
)
#DISABLE_MAGIC_FUNCTIONS=true
source $ZSH/oh-my-zsh.sh

# User configuration

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
export LANG=en_US.UTF-8
export LC_CTYPE=en_US.UTF-8

# Preferred editor for local and remote sessions
# if [[ -n $SSH_CONNECTION ]]; then
#   export EDITOR='vim'
# else
#   export EDITOR='mvim'
# fi
export EDITOR='vim'

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

# ssh
# export SSH_KEY_PATH="~/.ssh/rsa_id"

# Set personal aliases, overriding those provided by oh-my-zsh libs,
# plugins, and themes. Aliases can be placed here, though oh-my-zsh
# users are encouraged to define aliases within the ZSH_CUSTOM folder.
# For a full list of active aliases, run `alias`.
#
# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"

#eval "$(direnv hook zsh)"
#export PATH=$PATH:$HOME/Library/Python/2.7/bin/
# Go stuff
export GOPATH=$HOME/go:$HOME/git/be/go
export GOROOT=/usr/local/go
export GOBIN=$HOME/go/bin
export PATH=$PATH:$HOME/go/bin:$GOROOT/bin
# Add npm path
export PATH=$PATH:$HOME/.npm/global/bin
# Add $HOME/.local/bin
export PATH=$PATH:$HOME/.local/bin

# AWS autocomplete
#source "$(which aws_zsh_completer.sh)"

alias currdate='date +"%Y-%m-%d"'
alias notes='vim $HOME/Documents/Notes/$(currdate).md'
alias cdbe='cd $HOME/git/be'
alias cdco='cd $HOME/git/config'
alias gopathbe='export GOPATH=$GOPATH:$HOME/git/be/go'
alias cdtrunk='cd $HOME/git/be'
#alias cdfe='cd /var/www/html/fe/trunk'
alias cdfe='cd /Library/WebServer/Documents/fe'
alias cdgo='cd $HOME/git/be/go'
alias svnversion=gitversion
# alias open='xdg-open'
alias aws-decode-message='aws sts decode-authorization-message --encoded-message'

gitversion() {
	info=$(git svn info 2>/dev/null)
	EXITCODE=$?
	if [[ $EXITCODE -ne 0 ]]
	then
		/usr/bin/svnversion
	else
		printf $info | grep '^Revision: ' | cut -d ' ' -f2
	fi
}

# The next line updates PATH for the Google Cloud SDK.
if [ -f '$HOME/bin/google-cloud-sdk/path.zsh.inc' ]; then . '$HOME/bin/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '$HOME/bin/google-cloud-sdk/completion.zsh.inc' ]; then . '$HOME/bin/google-cloud-sdk/completion.zsh.inc'; fi

alias rundoc='godoc -http ":6060" -index -index_files $HOME/godoc_index -play'

# Fix for subversion error in zsh
#source $ZSH/_subversion

#export TERMINAL=gnome-terminal

# kubectl zsh completion
# source <(kubectl completion zsh)

# kubeadm zsh completion
#source <(kubeadm completion zsh)

# aws command completion
#source /usr/share/zsh/site-functions/aws_zsh_completer.sh
source /usr/local/bin/aws_zsh_completer.sh

# minikube completion
#source <(minikube completion zsh)

# ELK DEVELOPMENT SETTINGS
export DENV=test
export GAMECENTER=99
export DI_PROXY_USER=${whoami}
autoload -U +X bashcompinit && bashcompinit
complete -o nospace -C /usr/local/bin/terraform terraform
# zprof
#
# Just Java Things
java8_home="$(/usr/libexec/java_home -v 1.8)"
java13_home="$(/usr/libexec/java_home -v 13)"
alias java8="export JAVA_HOME=${java8_home}"
alias java13="export JAVA_HOME=${java13_home}"


#!/bin/bash

main() {
	local dir=$(find ~/src -mindepth 1 -maxdepth 1 -type d| fzf)

	if [[ -z $dir ]]; then
    	exit 0
	fi
	
	name=$(basename $dir)
	running=$(pgrep tmux)
	
	if [[ -z $TMUX ]] && [[ -z $running ]]; then
		tmux new -s $name -c $dir
		exit 0
	fi

	if ! tmux has-session -t $name 2>/dev/null; then
		tmux new -ds $name -c $dir
	fi

	if [[ -z $TMUX ]]; then
		tmux attach -t $name
		exit 0
	fi

	tmux switchc -t $name
}

main

#!/bin/bash

main() {
	local dirs=$(find ~/src ~/src/voi ~/src/ccarlfjord -mindepth 1 -maxdepth 1 -type d 2>/dev/null)
	dirs=$(printf "$HOME\n$dirs")
	dir=$(echo "$dirs" | fzf)

	if [[ -z $dir ]]; then
		exit 0
	fi

	name=$(basename "${dir}" | tr . _)
	running=$(pgrep tmux)
	if [[ -z $TMUX ]] && [[ -z $running ]]; then
		tmux new -s "$name" -c "$dir"
		exit 0
	fi

	if ! tmux ls -F#S | grep -q -x "$name"; then
		tmux new -ds "$name" -c "$dir"
	fi

	if [[ -z $TMUX ]]; then
		tmux attach -t "$name"
		exit 0
	fi

	tmux switchc -t "$name"
}

main

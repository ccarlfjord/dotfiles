#!/bin/bash

# Worktree convention: <repo>/.worktrees/<name>/ (gitignored globally).
main() {
	local -a dirs=("$HOME") roots=("$HOME"/src/* "$HOME"/src/*/*)
	local dir
	for dir in "${roots[@]}"; do
		[[ -d $dir && -e $dir/.git ]] || continue
		dirs+=("$dir")
		for wt in "$dir"/.worktrees/*; do
			[[ -d $wt ]] && dirs+=("$wt")
		done
	done

	local pick d
	# Display form is also the name-derivation input below: change one, change both.
	# ~/src/... keeps the picker compact.
	local -a entries=()
	for d in "${dirs[@]}"; do
		entries+=("${d/"$HOME"/\~}")
	done
	pick=$(printf '%s\n' "${entries[@]}" | fzf --query="${1:-}") || exit 0
	local dir
	case $pick in
	"~") dir=$HOME ;;
	*) dir="$HOME/${pick#\~/}" ;;
	esac
	# ~/ -> home; ~/src/<repo>[/[.worktrees/]wt] -> repo[_wt]
	local name=$pick
	case $pick in
	"~") name=home ;;
	*) name=${pick#\~/src/} ;;
	esac
	name=${name//.worktrees\//}   # drop the convention dir
	name=${name//[^a-zA-Z0-9_-]/_} # tmux-safe: letters, digits, _, -

	# A tmux server on a different socket (-L) must not count as "running":
	# only check the default server.
	if [[ -z $TMUX ]] && ! tmux ls >/dev/null 2>&1; then
		exec tmux new -s "$name" -c "$dir"
	fi

	if ! tmux ls -F '#S' 2>/dev/null | grep -qx -- "$name"; then
		tmux new -ds "$name" -c "$dir"
	fi

	if [[ -z $TMUX ]]; then
		exec tmux attach -t "$name"
	fi
	tmux switchc -t "$name"
}

main "$@"

#!/usr/bin/env bash
# Puts the reachability audit in front of every production push on this machine.
# Git does not copy hooks with a clone, so run this once per machine.
#   bash scripts/reach-install.sh <folder holding the site checkouts>
root=$(cd "${1:?folder holding the site checkouts}" && pwd)
hook="$(cd "$(dirname "$0")" && pwd)/reach-hook.sh"
add() { # site, checkout, build folder
  local file; file="$(git -C "$2" rev-parse --git-common-dir)/hooks/pre-push"
  case "$file" in /*|?:*) ;; *) file="$2/$file" ;; esac
  if [ -e "$file" ] && ! grep -q reach-hook "$file"; then echo "skipped $1: $file already exists"; return; fi
  printf '#!/usr/bin/env bash\nexec bash "%s" %s "%s" "%s"\n' "$hook" "$1" "$2" "$3" > "$file"
  chmod +x "$file"
  echo "installed $1: $file"
}
add spiritseeds "$root/_ss-preview" "$root/_ss-preview"
add storyshaped "$root/storyShapedStudios" "$root/storyShapedStudios/frontend"
add edgeofthemap "$root/_eotm-site" "$root/_eotm-site"

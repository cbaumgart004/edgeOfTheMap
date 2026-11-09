#!/usr/bin/env bash
# A pre-push hook: a push to production runs the reachability audit first, and a
# new gap stops the push. Installed by reach-install.sh.
#   reach-hook.sh <site> <preview checkout> <folder holding the site's package.json>
#
# A release merges origin/preview, so that is what gets audited, from the checkout
# that has node_modules. The checkout has to be at origin/preview and clean, or the
# audit would prove something about other code.
site=$1; checkout=$2; dir=$3
here=$(cd "$(dirname "$0")" && pwd)
unset $(git rev-parse --local-env-vars)
stop() { echo "reach-audit: $1. Production push stopped." >&2; exit 1; }
while read -r _ local_sha remote_ref _; do
  [ "$remote_ref" = refs/heads/production ] || continue
  [ "$local_sha" = 0000000000000000000000000000000000000000 ] && continue
  head=$(git -C "$checkout" rev-parse HEAD)
  [ "$head" = "$(git -C "$checkout" rev-parse origin/preview)" ] || stop "$checkout is not at origin/preview"
  git -C "$checkout" diff --quiet HEAD || stop "$checkout has uncommitted changes"
  git -C "$checkout" merge-base --is-ancestor "$head" "$local_sha" || stop "this release does not contain origin/preview"
  echo "reach-audit: $site, building $dir and reading every page at three widths" >&2
  (cd "$here/.." && node scripts/reach-audit.mjs "$site" --build "$dir") >&2 || stop "new editor gaps above"
done
exit 0

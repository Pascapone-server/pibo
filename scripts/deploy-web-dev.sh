#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_PUBLIC_URL="${PIBO_DEV_PUBLIC_URL:-https://dev.pibo.neuralnexus.me/apps/chat}"
DEV_BRANCH="${PIBO_DEV_BRANCH:-dev}"
DEV_REMOTE="${PIBO_DEV_REMOTE:-origin}"

cd "$ROOT_DIR"

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$DEV_BRANCH" ]]; then
	dev_worktree="$(git worktree list --porcelain | awk -v branch="refs/heads/${DEV_BRANCH}" '
		$1 == "worktree" { path = $2 }
		$1 == "branch" && $2 == branch { print path; exit }
	')"
	if [[ -n "$dev_worktree" && -x "$dev_worktree/scripts/deploy-web-dev.sh" ]]; then
		echo "==> Re-running dev deploy from $DEV_BRANCH worktree: $dev_worktree"
		exec "$dev_worktree/scripts/deploy-web-dev.sh"
	fi
	echo "Dev deploy must run from branch '$DEV_BRANCH' so the hosted dev server mirrors that branch." >&2
	echo "Current branch: ${current_branch:-detached}" >&2
	echo "Create or check out a '$DEV_BRANCH' worktree, then retry." >&2
	exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
	echo "Dev deploy requires a clean '$DEV_BRANCH' worktree." >&2
	git status --short >&2
	exit 1
fi

echo "==> Syncing $DEV_BRANCH with $DEV_REMOTE/$DEV_BRANCH"
git fetch "$DEV_REMOTE" "$DEV_BRANCH"
git merge --ff-only "$DEV_REMOTE/$DEV_BRANCH"

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "$DEV_REMOTE/$DEV_BRANCH")" ]]; then
	echo "Dev deploy refused: local '$DEV_BRANCH' does not exactly match '$DEV_REMOTE/$DEV_BRANCH'." >&2
	exit 1
fi

echo "==> Building dev web gateway from $(git rev-parse --short HEAD) on $DEV_BRANCH"
npm run build

echo "==> Verifying dev public web app without restarting"
if curl -fsS "$DEV_PUBLIC_URL" >/tmp/pibo-web-dev-app.html; then
	echo "Existing dev public web app reachable at $DEV_PUBLIC_URL"
else
	echo "Existing dev public web app is not reachable yet at $DEV_PUBLIC_URL"
fi

echo "Dev deploy complete."
echo "Dev gateway was not restarted."
echo "To activate this dev deployment, run:"
echo
echo "  pibo gateway dev restart"
echo
echo "For a first-time dev gateway start, run:"
echo
echo "  pibo gateway dev start"

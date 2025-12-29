#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BRUTEFORCE=0
for arg in "$@"; do
	case "$arg" in
		--bruteforce)
			BRUTEFORCE=1
			;;
		-h|--help)
			echo "Usage: $(basename "$0") [--bruteforce]"
			echo "  --bruteforce   Also delete lockfiles (package-lock.json, yarn.lock, pnpm-lock.yaml)."
			exit 0
			;;
		*)
			echo "Unknown argument: $arg" 1>&2
			echo "Try: $(basename "$0") --help" 1>&2
			exit 1
			;;
	esac
done

# Re-initialize all node_modules across the mono-folder (awi / thinknotes / twinsurf / sites)
# Default: deletes local folders and caches only (keeps lockfiles -> reproducible).
# With --bruteforce: also deletes lockfiles.
# It does NOT run npm install. Run ./build_and_deploy.sh afterwards.

echo "==== Reinit all node_modules (root: $ROOT) ===="
if [ "$BRUTEFORCE" -eq 1 ]; then
	echo "[MODE] bruteforce (lockfiles will be deleted)"
else
	echo "[MODE] safe (lockfiles kept)"
fi

echo "[INFO] Removing node_modules folders..."
find "$ROOT" -type d -name node_modules -prune -exec rm -rf '{}' +

echo "[INFO] Removing common caches/build folders..."
find "$ROOT" -type d \( -name dist -o -name build -o -name .vite -o -name .parcel-cache -o -name .next -o -name .nuxt -o -name .svelte-kit -o -name .cache \) -prune -exec rm -rf '{}' +

if [ "$BRUTEFORCE" -eq 1 ]; then
	echo "[INFO] Removing lockfiles (package-lock.json, pnpm-lock.yaml, yarn.lock)..."
	find "$ROOT" -type f \( -name package-lock.json -o -name pnpm-lock.yaml -o -name yarn.lock \) -print -delete
fi

echo "==== DONE ===="

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CODE_DIR="$PROJECT_ROOT"
DOCS_DIR=""
PRIVATE_DIR=""
PRIVATE_REMOTE="git@github.com:FairladyZ625/Agora_Private.git"
PRIVATE_BRANCH="master"
CODE_REF="HEAD"
DOCS_REF="HEAD"
PUSH_AFTER_SYNC=1
DOCS_DIR_EXPLICIT=0
PRIVATE_DIR_EXPLICIT=0

CODE_REMOTE_NAME="agora-code-local"
DOCS_REMOTE_NAME="agora-docs-local"

usage() {
  cat <<'EOF'
sync-agora-private.sh

Synchronize the private aggregate repository so that:
  - the code repository stays at the private repo root
  - the docs repository stays under docs/

The source of truth remains the original repositories.
Agora_Private is only a private aggregate mirror.

Usage:
  ./scripts/sync-agora-private.sh
  ./scripts/sync-agora-private.sh --no-push
  ./scripts/sync-agora-private.sh --code-dir /path/to/Agora --docs-dir /path/to/agora_doc
  ./scripts/sync-agora-private.sh --private-dir /path/to/Agora_Private --private-remote <git-url>

Options:
  --code-dir <path>         Source code repository root
  --docs-dir <path>         Source docs repository root
  --private-dir <path>      Local checkout path for Agora_Private
  --private-remote <url>    Remote URL for Agora_Private
  --private-branch <name>   Target branch in Agora_Private (default: master)
  --code-ref <ref>          Code repository ref to sync (default: HEAD)
  --docs-ref <ref>          Docs repository ref to sync (default: HEAD)
  --no-push                 Update local Agora_Private checkout only
  -h, --help                Show this help
EOF
}

fail() {
  echo "$*" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "missing required command: $1"
  fi
}

require_git_repo() {
  local repo_dir="$1"
  local label="$2"
  git -C "$repo_dir" rev-parse --show-toplevel >/dev/null 2>&1 || fail "$label is not a git repository: $repo_dir"
}

require_clean_repo() {
  local repo_dir="$1"
  local label="$2"
  local status
  status="$(git -C "$repo_dir" status --porcelain)"
  if [ -n "$status" ]; then
    echo "$status" >&2
    fail "$label has uncommitted changes: $repo_dir"
  fi
}

ensure_remote() {
  local repo_dir="$1"
  local remote_name="$2"
  local remote_url="$3"

  if git -C "$repo_dir" remote get-url "$remote_name" >/dev/null 2>&1; then
    git -C "$repo_dir" remote set-url "$remote_name" "$remote_url"
  else
    git -C "$repo_dir" remote add "$remote_name" "$remote_url"
  fi
}

remote_branch_exists() {
  local repo_dir="$1"
  local remote_name="$2"
  local branch_name="$3"
  git -C "$repo_dir" show-ref --verify --quiet "refs/remotes/$remote_name/$branch_name"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --code-dir)
      CODE_DIR="$2"
      shift 2
      ;;
    --docs-dir)
      DOCS_DIR="$2"
      DOCS_DIR_EXPLICIT=1
      shift 2
      ;;
    --private-dir)
      PRIVATE_DIR="$2"
      PRIVATE_DIR_EXPLICIT=1
      shift 2
      ;;
    --private-remote)
      PRIVATE_REMOTE="$2"
      shift 2
      ;;
    --private-branch)
      PRIVATE_BRANCH="$2"
      shift 2
      ;;
    --code-ref)
      CODE_REF="$2"
      shift 2
      ;;
    --docs-ref)
      DOCS_REF="$2"
      shift 2
      ;;
    --no-push)
      PUSH_AFTER_SYNC=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

require_command git

require_git_repo "$CODE_DIR" "code repository"

COMMON_GIT_DIR="$(git -C "$CODE_DIR" rev-parse --path-format=absolute --git-common-dir)"
SOURCE_ROOT="$(cd "$(dirname "$COMMON_GIT_DIR")" && pwd)"

if [ "$DOCS_DIR_EXPLICIT" -eq 0 ]; then
  DOCS_DIR="$SOURCE_ROOT/docs"
fi

if [ "$PRIVATE_DIR_EXPLICIT" -eq 0 ]; then
  PRIVATE_DIR="$(cd "$SOURCE_ROOT/.." && pwd)/Agora_Private"
fi

require_git_repo "$DOCS_DIR" "docs repository"
require_clean_repo "$CODE_DIR" "code repository"
require_clean_repo "$DOCS_DIR" "docs repository"

CODE_SHA="$(git -C "$CODE_DIR" rev-parse "$CODE_REF")"
DOCS_SHA="$(git -C "$DOCS_DIR" rev-parse "$DOCS_REF")"
CODE_SHORT_SHA="$(git -C "$CODE_DIR" rev-parse --short "$CODE_REF")"
DOCS_SHORT_SHA="$(git -C "$DOCS_DIR" rev-parse --short "$DOCS_REF")"

if [ -e "$PRIVATE_DIR" ] && [ ! -d "$PRIVATE_DIR/.git" ]; then
  fail "private dir exists but is not a git repository: $PRIVATE_DIR"
fi

if [ ! -d "$PRIVATE_DIR/.git" ]; then
  git clone "$PRIVATE_REMOTE" "$PRIVATE_DIR"
fi

require_git_repo "$PRIVATE_DIR" "private aggregate repository"
require_clean_repo "$PRIVATE_DIR" "private aggregate repository"

ensure_remote "$PRIVATE_DIR" origin "$PRIVATE_REMOTE"
ensure_remote "$PRIVATE_DIR" "$CODE_REMOTE_NAME" "$CODE_DIR"
ensure_remote "$PRIVATE_DIR" "$DOCS_REMOTE_NAME" "$DOCS_DIR"

if git ls-remote --exit-code origin "refs/heads/$PRIVATE_BRANCH" >/dev/null 2>&1; then
  git -C "$PRIVATE_DIR" fetch origin "$PRIVATE_BRANCH"
fi
git -C "$PRIVATE_DIR" fetch "$CODE_REMOTE_NAME" "$CODE_REF:refs/remotes/$CODE_REMOTE_NAME/sync"
git -C "$PRIVATE_DIR" fetch "$DOCS_REMOTE_NAME" "$DOCS_REF:refs/remotes/$DOCS_REMOTE_NAME/sync"

if git -C "$PRIVATE_DIR" show-ref --verify --quiet "refs/heads/$PRIVATE_BRANCH"; then
  git -C "$PRIVATE_DIR" checkout "$PRIVATE_BRANCH"
elif remote_branch_exists "$PRIVATE_DIR" origin "$PRIVATE_BRANCH"; then
  git -C "$PRIVATE_DIR" checkout -B "$PRIVATE_BRANCH" "origin/$PRIVATE_BRANCH"
else
  git -C "$PRIVATE_DIR" checkout -B "$PRIVATE_BRANCH" "refs/remotes/$CODE_REMOTE_NAME/sync"
fi

if remote_branch_exists "$PRIVATE_DIR" origin "$PRIVATE_BRANCH"; then
  git -C "$PRIVATE_DIR" merge --ff-only "origin/$PRIVATE_BRANCH"
fi

if ! git -C "$PRIVATE_DIR" merge-base --is-ancestor "refs/remotes/$CODE_REMOTE_NAME/sync" HEAD; then
  git -C "$PRIVATE_DIR" merge --no-ff --no-edit \
    -m "chore(private): sync code repo @ $CODE_SHORT_SHA" \
    "refs/remotes/$CODE_REMOTE_NAME/sync"
fi

if git -C "$PRIVATE_DIR" cat-file -e HEAD:docs 2>/dev/null; then
  git -C "$PRIVATE_DIR" subtree pull --prefix=docs "$DOCS_REMOTE_NAME" "$DOCS_REF" \
    -m "chore(private): sync docs repo @ $DOCS_SHORT_SHA"
else
  git -C "$PRIVATE_DIR" subtree add --prefix=docs "$DOCS_REMOTE_NAME" "$DOCS_REF" \
    -m "chore(private): import docs repo @ $DOCS_SHORT_SHA"
fi

require_clean_repo "$PRIVATE_DIR" "private aggregate repository"

if [ "$PUSH_AFTER_SYNC" -eq 1 ]; then
  git -C "$PRIVATE_DIR" push origin "$PRIVATE_BRANCH"
fi

PRIVATE_SHA="$(git -C "$PRIVATE_DIR" rev-parse HEAD)"

cat <<EOF
Agora_Private sync complete.
  code repo:    $CODE_DIR @ $CODE_SHA
  docs repo:    $DOCS_DIR @ $DOCS_SHA
  private repo: $PRIVATE_DIR @ $PRIVATE_SHA
  pushed:       $( [ "$PUSH_AFTER_SYNC" -eq 1 ] && printf 'yes' || printf 'no' )
EOF

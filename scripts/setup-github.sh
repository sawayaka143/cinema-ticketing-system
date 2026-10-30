#!/usr/bin/env bash
# One-time GitHub setup for the owner. Safe to re-run.
#   Usage: scripts/setup-github.sh [teammate-login ...]
# Needs: gh CLI logged in as the repo owner, run inside the repo after the first push to main.
set -euo pipefail

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner=${repo%%/*}
echo "Configuring $repo (owner: $owner)"

echo "→ Merge settings: squash only, PR title as commit message, delete merged branches"
gh api -X PATCH "repos/$repo" --silent \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F allow_auto_merge=false -F allow_update_branch=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY \
  -F has_wiki=false -F has_projects=true

echo "→ Secret scanning + push protection"
gh api -X PATCH "repos/$repo" --silent --input - <<'JSON' || echo "  (skipped: not available)"
{"security_and_analysis": {"secret_scanning": {"status": "enabled"}, "secret_scanning_push_protection": {"status": "enabled"}}}
JSON

echo "→ Ruleset 'main' (no bypass: the owner's PRs also need green checks)"
ruleset_json=$(cat <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
  "bypass_actors": [],
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "required_linear_history"},
    {"type": "pull_request", "parameters": {
      "required_approving_review_count": 0,
      "dismiss_stale_reviews_on_push": true,
      "require_code_owner_review": false,
      "require_last_push_approval": false,
      "required_review_thread_resolution": true,
      "allowed_merge_methods": ["squash"]
    }},
    {"type": "required_status_checks", "parameters": {
      "strict_required_status_checks_policy": false,
      "do_not_enforce_on_create": false,
      "required_status_checks": [
        {"context": "PR rules"},
        {"context": "Owner approval"},
        {"context": "Backend"},
        {"context": "Frontend"}
      ]
    }}
  ]
}
JSON
)
existing=$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name=="main") | .id' || true)
if [[ -n "$existing" ]]; then
  gh api -X PUT "repos/$repo/rulesets/$existing" --silent --input - <<< "$ruleset_json"
else
  gh api -X POST "repos/$repo/rulesets" --silent --input - <<< "$ruleset_json"
fi

echo "→ Environment 'production' (main only)"
gh api -X PUT "repos/$repo/environments/production" --silent --input - <<'JSON'
{"deployment_branch_policy": {"protected_branches": true, "custom_branch_policies": false}}
JSON

echo "→ Labels"
label() { gh label create "$1" --color "$2" --description "$3" --force --repo "$repo" >/dev/null; }
label "area:frontend" "1d76db" "frontend/ (owner only)"
label "area:backend"  "0e8a16" "backend/ API"
label "area:database" "5319e7" "migrations and schema"
label "area:tests"    "fbca04" "tests"
label "area:docs"     "c5def5" "documentation"
label "area:ci"       "bfdadc" "workflows and tooling"
label "type:feat"     "a2eeef" "new behaviour"
label "type:fix"      "d73a4a" "bug fix"
label "critical-path" "b60205" "the demo can't work without it"
label "stretch"       "ededed" "only after the MVP works"
label "size-ok"       "000000" "owner allows a PR over 500 lines"

echo "→ Milestones W10–W14 (due Fridays)"
for m in "W10 2026-11-06" "W11 2026-11-13" "W12 2026-11-20" "W13 2026-11-27" "W14 2026-12-04"; do
  title=${m% *}; due=${m#* }
  if ! gh api "repos/$repo/milestones?state=all" --jq '.[].title' | grep -qx "$title"; then
    gh api -X POST "repos/$repo/milestones" --silent -f title="$title" -f due_on="${due}T18:00:00Z"
  fi
done

for user in "$@"; do
  echo "→ Inviting $user (write access)"
  gh api -X PUT "repos/$repo/collaborators/$user" --silent -f permission=push
done

echo
echo "Done. Still manual (see docs/OWNER-SETUP.md): Vercel projects, Supabase projects, secrets."

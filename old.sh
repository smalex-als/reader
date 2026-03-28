REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

CUTOFF_EPOCH="$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print(int((datetime.now(timezone.utc) - timedelta(days=5)).timestamp()))
PY
)"
export CUTOFF_EPOCH
echo "Repo: $REPO"
echo "Cutoff epoch: $CUTOFF_EPOCH"
python3 - <<'PY'
from datetime import datetime, timezone
import os
cutoff = int(os.environ.get("CUTOFF_EPOCH", "0"))
print("Cutoff UTC:", datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat())
PY

parse_epoch() {
  python3 - "$1" <<'PY'
import sys
from datetime import datetime, timezone
s = sys.argv[1]
try:
  dt = datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
  print(int(dt.timestamp()))
except Exception:
  print("")
PY
}

gh api --paginate "repos/$REPO/branches?per_page=100" \
| jq -r '.[] | select(.protected|not) | select(.name!="main" and .name!="master") | [.name, .commit.sha] | @tsv' \
| while IFS=$'\t' read -r branch sha; do
  commit_date="$(gh api "repos/$REPO/commits/$sha" --jq '.commit.committer.date // .commit.author.date')"
  commit_epoch="$(parse_epoch "$commit_date")"
  echo "Branch: $branch"
  echo "SHA: $sha"
  echo "Commit date: $commit_date"
  echo "Commit epoch: $commit_epoch"
  if [[ -z "$commit_epoch" ]]; then
    echo "Skip (unparsed date) $branch ($commit_date)"
    continue
  fi
  if [[ "$commit_epoch" -lt "$CUTOFF_EPOCH" ]]; then
    echo "Deleting $branch ($commit_date)"
    gh api -X DELETE "repos/$REPO/git/refs/heads/$branch"
  else
    echo "Keep $branch ($commit_date)"
  fi
done

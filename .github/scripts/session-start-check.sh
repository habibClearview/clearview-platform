#!/bin/bash
# Session Start Check
# Run this at the start of every build session
# Reports platform health before any code is written

set -e

REPO="habibClearview/clearview-platform"
TOKEN="${GITHUB_TOKEN}"
RED='\033[0;31m'
GREEN='\033[0;32m'
AMBER='\033[0;33m'
NC='\033[0m'

echo ""
echo "=================================="
echo "  CLEARVIEW SESSION START CHECK"
echo "=================================="
echo ""

ISSUES=0

# 1. Check main branch deployment
echo "1. Vercel deployment (main)..."
STATUS=$(curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/commits/main/statuses" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['state'] if d else 'unknown')" 2>/dev/null)

if [ "$STATUS" = "success" ]; then
  echo "   ${GREEN}✓ Production deployment: healthy${NC}"
else
  echo "   ${RED}✗ Production deployment: $STATUS${NC}"
  echo "   ACTION REQUIRED: Fix deployment before starting new work"
  ISSUES=$((ISSUES+1))
fi

# 2. Check for open critical PRs that need attention
echo ""
echo "2. Open PRs..."
OPEN_PRS=$(curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/pulls?state=open" \
  | python3 -c "
import json,sys
prs=json.load(sys.stdin)
for pr in prs:
    print(f'   #{pr["number"]}: {pr["title"][:60]}')
print(f'   Total: {len(prs)}')
" 2>/dev/null)
echo "$OPEN_PRS"

# 3. Run tests
echo ""
echo "3. Automated tests..."
cd "$(git rev-parse --show-toplevel)" 2>/dev/null || true
if [ -f "package.json" ] && grep -q '"test"' package.json; then
  npm test --silent 2>/dev/null && echo "   ${GREEN}✓ All tests pass${NC}" || {
    echo "   ${RED}✗ Tests failing${NC}"
    echo "   ACTION REQUIRED: Fix failing tests before starting new work"
    ISSUES=$((ISSUES+1))
  }
else
  echo "   ${AMBER}⚠ No test script found${NC}"
fi

# 4. Check recent CodeRabbit critical findings
echo ""
echo "4. Recent CodeRabbit findings..."
CRITICAL=$(curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/issues/comments?per_page=20" \
  | python3 -c "
import json,sys
comments=json.load(sys.stdin)
criticals=[]
for c in comments:
    if 'coderabbit' in c.get('user',{}).get('login','').lower():
        if 'CRITICAL' in c.get('body','') or 'critical' in c.get('body','').lower():
            criticals.append(c.get('html_url',''))
if criticals:
    print(f'   CRITICAL issues found in recent PRs:')
    for u in criticals[:3]: print(f'   - {u}')
else:
    print('   No recent critical issues')
" 2>/dev/null)
echo "$CRITICAL"

echo ""
echo "=================================="
if [ $ISSUES -eq 0 ]; then
  echo "  ${GREEN}✓ ALL CLEAR — safe to start building${NC}"
else
  echo "  ${RED}✗ $ISSUES ISSUE(S) NEED FIXING FIRST${NC}"
  echo "  Do not start new features until resolved"
fi
echo "=================================="
echo ""

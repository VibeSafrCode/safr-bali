#!/bin/bash

set -e

echo "===================================="
echo "SAFR Bali local project check"
echo "===================================="
echo ""

check_file() {
  if [ -f "$1" ]; then
    echo "✅ $1"
  else
    echo "❌ Missing file: $1"
    exit 1
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo "✅ $1"
  else
    echo "❌ Missing directory: $1"
    exit 1
  fi
}

echo "1. Checking Git status..."
if git diff --quiet && git diff --cached --quiet; then
  echo "✅ Git working tree is clean"
else
  echo "⚠️ Git has uncommitted changes"
  git status --short
fi

echo ""
echo "2. Checking project directories..."
check_dir "06 Development/backend"
check_dir "06 Development/bot"
check_dir "06 Development/docs"
check_dir "06 Development/docs/deploy"

echo ""
echo "3. Checking backend files..."
check_file "06 Development/backend/app/main.py"
check_file "06 Development/backend/app/core/config.py"
check_file "06 Development/backend/app/db/session.py"
check_file "06 Development/backend/requirements.txt"
check_file "06 Development/backend/.env.example"
check_file "06 Development/backend/alembic.ini"

echo ""
echo "4. Checking bot files..."
check_file "06 Development/bot/app/main.py"
check_file "06 Development/bot/app/core/config.py"
check_file "06 Development/bot/app/content/menu.json"
check_file "06 Development/bot/app/content/texts.json"
check_file "06 Development/bot/app/content/texts.py"
check_file "06 Development/bot/app/content/visas.json"
check_file "06 Development/bot/app/content/visas.py"
check_file "06 Development/bot/app/content/housing.json"
check_file "06 Development/bot/app/content/housing.py"
check_file "06 Development/bot/app/content/README.md"
check_file "06 Development/bot/app/handlers/start.py"
check_file "06 Development/bot/app/handlers/menu.py"
check_file "06 Development/bot/app/handlers/destinations.py"
check_file "06 Development/bot/app/handlers/contact.py"
check_file "06 Development/bot/app/handlers/admin_panel.py"
check_file "06 Development/bot/app/handlers/fallback.py"
check_file "06 Development/bot/app/services/activity.py"
check_file "06 Development/bot/app/services/referrals.py"
check_file "06 Development/bot/requirements.txt"
check_file "06 Development/bot/.env.example"

echo ""
echo "5. Checking deploy docs..."
check_file "06 Development/docs/deploy/Backend Runbook.md"
check_file "06 Development/docs/deploy/Bot Runbook.md"
check_file "06 Development/docs/deploy/Production Checklist.md"
check_file "06 Development/docs/deploy/VPS Update Runbook.md"
check_file "06 Development/docs/deploy/VPS First Deploy Runbook.md"
check_file "06 Development/docs/deploy/Backup Runbook.md"

echo ""
echo "6. Checking Git ignore rules..."
if grep -Fq "06 Development/bot/app/data/*.json" .gitignore; then
  echo "✅ Bot runtime data is ignored"
else
  echo "❌ Bot runtime data ignore rule is missing"
  exit 1
fi

if grep -Fq ".env" .gitignore; then
  echo "✅ .env files are ignored"
else
  echo "❌ .env ignore rule is missing"
  exit 1
fi

echo ""
echo "7. Checking tags..."
git tag | grep -q "v0.1.0-backend-mvp" && echo "✅ v0.1.0-backend-mvp"
git tag | grep -q "v0.2.1-bot-mvp-clean" && echo "✅ v0.2.1-bot-mvp-clean"
git tag | grep -q "v0.2.2-ready-for-deploy" && echo "✅ v0.2.2-ready-for-deploy"

echo ""
echo "8. Running Python checks..."

SAFR_BOT_PYTHON="06 Development/bot/.venv/bin/python"
SAFR_BACKEND_PYTHON="06 Development/backend/.venv/bin/python"

if [ ! -x "$SAFR_BOT_PYTHON" ]; then
  SAFR_BOT_PYTHON="python3"
fi

if [ ! -x "$SAFR_BACKEND_PYTHON" ]; then
  SAFR_BACKEND_PYTHON="python3"
fi

"$SAFR_BOT_PYTHON" -m compileall -q "06 Development/bot/app" "06 Development/bot/tests"
"$SAFR_BACKEND_PYTHON" -m compileall -q \
  "06 Development/backend/app" \
  "06 Development/backend/alembic" \
  "06 Development/backend/tests"
echo "✅ Python syntax checks passed"

BOT_TOKEN="123:test-token" \
ADMIN_CHAT_ID="1" \
PYTHONPATH="06 Development/bot" \
"$SAFR_BOT_PYTHON" -m unittest discover \
  -s "06 Development/bot/tests" \
  -t "06 Development/bot" \
  -v
echo "✅ Bot regression tests passed"

BOT_TOKEN="123:test-token" \
ADMIN_CHAT_ID="1" \
PYTHONPATH="06 Development/bot" \
"$SAFR_BOT_PYTHON" -c "import app.main"
echo "✅ Bot runtime import passed"

DATABASE_URL="sqlite+pysqlite:///:memory:" \
SERVICE_API_TOKEN="service-test-token" \
ADMIN_API_TOKEN="admin-test-token" \
PYTHONPATH="06 Development/backend" \
"$SAFR_BACKEND_PYTHON" -m unittest discover \
  -s "06 Development/backend/tests" \
  -t "06 Development/backend" \
  -v
echo "✅ Backend regression tests passed"

if [[ "$SAFR_BOT_PYTHON" == *"/.venv/bin/python" ]]; then
  "$SAFR_BOT_PYTHON" -m pip check
fi

if [[ "$SAFR_BACKEND_PYTHON" == *"/.venv/bin/python" ]]; then
  "$SAFR_BACKEND_PYTHON" -m pip check
fi

echo ""
echo "===================================="
echo "✅ Local check completed"
echo "===================================="

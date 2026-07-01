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
check_file "06 Development/bot/app/handlers/start.py"
check_file "06 Development/bot/app/handlers/menu.py"
check_file "06 Development/bot/app/handlers/contact.py"
check_file "06 Development/bot/app/handlers/fallback.py"
check_file "06 Development/bot/requirements.txt"
check_file "06 Development/bot/.env.example"

echo ""
echo "5. Checking deploy docs..."
check_file "06 Development/docs/deploy/Backend Runbook.md"
check_file "06 Development/docs/deploy/Bot Runbook.md"
check_file "06 Development/docs/deploy/Production Checklist.md"

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
echo "===================================="
echo "✅ Local check completed"
echo "===================================="

.PHONY: help dev up down migrate test test-security lint format typecheck

help:
	@echo "RoomMate Finder Backend — Available Commands"
	@echo ""
	@echo "  make dev          Start development server (hot reload)"
	@echo "  make up           Start all services via Docker Compose"
	@echo "  make down         Stop all services"
	@echo "  make migrate      Apply pending Alembic migrations"
	@echo "  make makemig      Create a new migration (usage: make makemig name=add_thing)"
	@echo "  make test         Run full test suite with coverage"
	@echo "  make test-sec     Run security tests only"
	@echo "  make lint         Run ruff linter"
	@echo "  make format       Run ruff formatter"
	@echo "  make typecheck    Run mypy type checker"
	@echo "  make worker       Start Celery worker"
	@echo "  make beat         Start Celery beat scheduler"
	@echo ""

# ── Local development ────────────────────────────────────────────────────────
dev:
	uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

worker:
	celery -A app.workers.tasks.celery_app worker --loglevel=info \
		--queues=email,media,notifications,maintenance

beat:
	celery -A app.workers.tasks.celery_app beat --loglevel=info

flower:
	celery -A app.workers.tasks.celery_app flower --port=5555

# ── Docker ───────────────────────────────────────────────────────────────────
up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api

# ── Database ─────────────────────────────────────────────────────────────────
migrate:
	alembic upgrade head

makemig:
	alembic revision --autogenerate -m "$(name)"

rollback:
	alembic downgrade -1

# ── Testing ──────────────────────────────────────────────────────────────────
test:
	pytest --cov=app --cov-report=term-missing --cov-report=html -v

test-sec:
	pytest tests/security/ -v --tb=short

test-unit:
	pytest tests/unit/ tests/test_auth.py -v --tb=short -m "not integration"

# ── Code Quality ──────────────────────────────────────────────────────────────
lint:
	ruff check app/ tests/

format:
	ruff format app/ tests/

typecheck:
	mypy app/

check: lint typecheck

.PHONY: install hooks run test lint format format-check check frontend-check ci clean

install:
	pip install -r requirements-dev.txt

hooks:
	pre-commit install

run:
	uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test:
	pytest tests/ -v

lint:
	ruff check src tests scripts eval

format:
	ruff format src tests scripts eval

format-check:
	ruff format --check src tests scripts eval

check: lint format-check test

frontend-check:
	cd frontend && npm run lint -- --max-warnings 0 && npx prettier --check . && npm run typecheck && npm test && npm run build

# Everything the CI workflow runs (backend + frontend), locally
ci: check frontend-check

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +

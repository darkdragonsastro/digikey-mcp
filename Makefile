.PHONY: help install build typecheck lint test check

help: ## Show available targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install

build: ## Compile TypeScript to dist/
	npm run build

typecheck: ## Type-check src and tests
	npm run typecheck

lint: ## Run ESLint
	npm run lint

test: ## Run unit tests
	npm test

check: typecheck lint test ## Run typecheck, lint, and tests

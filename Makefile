LOCAL_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.local.yml
SERVER_COMPOSE := docker compose --profile https
READER_URL ?= http://localhost:$(or $(READER_PORT),3000)

.PHONY: help local-up local-start local-down local-stop local-restart local-logs local-ps local-health local-open server-deploy server-up server-start server-down server-stop server-restart server-logs server-ps server-health lint test build check

help:
	@printf '%s\n' \
		'make local-up       Build and start Reader + Redis' \
		'make local-start    Start existing Reader + Redis containers' \
		'make local-stop     Stop local containers without removing them' \
		'make local-down     Stop and remove local containers' \
		'make local-restart  Restart Reader + Redis' \
		'make local-logs     Follow Reader + Redis logs' \
		'make local-ps       Show local container status' \
		'make local-health   Check the Reader health endpoint' \
		'make local-open     Open Reader in the default browser' \
		'make server-deploy  Pull and deploy Reader on the server' \
		'make server-up      Build and start server Redis + Reader + HTTPS nginx' \
		'make server-start   Start existing server containers' \
		'make server-stop    Stop server containers without removing them' \
		'make server-down    Stop and remove server containers' \
		'make server-restart Restart the server stack' \
		'make server-logs    Follow server Redis + Reader + nginx logs' \
		'make server-ps      Show server container status' \
		'make server-health  Check Reader from inside the server container' \
		'make check          Run lint, tests, and production build'

local-up:
	$(LOCAL_COMPOSE) up --build -d --wait redis reader
	@printf 'Reader: %s\n' '$(READER_URL)'

local-start:
	$(LOCAL_COMPOSE) up -d --wait redis reader
	@printf 'Reader: %s\n' '$(READER_URL)'

local-stop:
	$(LOCAL_COMPOSE) stop reader redis

local-down:
	$(LOCAL_COMPOSE) down

local-restart:
	$(LOCAL_COMPOSE) restart redis reader

local-logs:
	$(LOCAL_COMPOSE) logs -f reader redis

local-ps:
	$(LOCAL_COMPOSE) ps

local-health:
	curl --fail --silent --show-error '$(READER_URL)/api/health'
	@printf '\n'

local-open:
	@if command -v open >/dev/null 2>&1; then \
		open '$(READER_URL)'; \
	elif command -v xdg-open >/dev/null 2>&1; then \
		xdg-open '$(READER_URL)'; \
	else \
		printf 'Open %s\n' '$(READER_URL)'; \
	fi

server-deploy:
	./deploy-local.sh

server-up:
	$(SERVER_COMPOSE) up --build -d --wait redis reader
	$(SERVER_COMPOSE) up -d --no-deps --force-recreate nginx

server-start:
	$(SERVER_COMPOSE) up -d --wait redis reader
	$(SERVER_COMPOSE) up -d --no-deps --force-recreate nginx

server-stop:
	$(SERVER_COMPOSE) stop nginx reader redis

server-down:
	$(SERVER_COMPOSE) down

server-restart:
	$(SERVER_COMPOSE) restart redis reader
	$(SERVER_COMPOSE) restart nginx

server-logs:
	$(SERVER_COMPOSE) logs -f nginx reader redis

server-ps:
	$(SERVER_COMPOSE) ps

server-health:
	$(SERVER_COMPOSE) exec -T reader curl --fail --silent --show-error http://127.0.0.1:3000/api/health
	@printf '\n'

lint:
	npm run lint

test:
	npm test

build:
	npm run build

check: lint test build

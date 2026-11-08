# Running ecommerce-platform with Docker

The whole project starts from the repository root with a single command:

```bash
docker compose up --build
```

Once it is running, the services are available at:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- WebSocket: ws://localhost:5000/ws
- MySQL: localhost:3307

## Services

- `client`: React + TypeScript dev server with hot reload.
- `server`: Node.js + Express + WebSocket, with hot reload via nodemon.
- `mysql`: MySQL 8.4 with a persistent volume, `mysql_data`.

## Running on Windows with Docker Desktop

1. Start Docker Desktop.
2. Open a terminal in the repository root.
3. Run `docker compose up --build`.

For reliable hot reload on Windows, the following are enabled:

- `CHOKIDAR_USEPOLLING=true`
- `WATCHPACK_POLLING=true`
- `nodemon --legacy-watch`

## Environment variables

For local Docker runs, all required development variables are already defined in `docker-compose.yml`.

If you need your own mail settings or secrets, create a local `server/.env` file based on `server/.env.example`. Do not commit this file to Git.

Inside Docker, the backend connects to MySQL by its service name:

```env
DB_HOST=mysql
MYSQL_HOST=mysql
```

Inside Docker, `localhost` cannot be used to reach the database container, because each container has its own network namespace.

## Production setup

The Dockerfiles define two stages:

- `dev`: development mode with hot reload.
- `prod`: a production build without development dependencies.

For the client, the production stage builds the React app and serves it with nginx.

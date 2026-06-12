# Docker запуск ecommerce-platform

Проєкт запускається з кореня репозиторію однією командою:

```bash
docker compose up --build
```

Після запуску доступні:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- WebSocket: ws://localhost:5000/ws
- MySQL: localhost:3307

## Склад сервісів

- `client` - React + TypeScript dev server з hot reload.
- `server` - Node.js + Express + WebSocket + nodemon hot reload.
- `mysql` - MySQL 8.4 з постійним volume `mysql_data`.

## Запуск на Windows з Docker Desktop

1. Запустіть Docker Desktop.
2. Відкрийте термінал у корені репозиторію.
3. Виконайте `docker compose up --build`.

Для стабільного hot reload на Windows увімкнені:

- `CHOKIDAR_USEPOLLING=true`
- `WATCHPACK_POLLING=true`
- `nodemon --legacy-watch`

## Змінні оточення

Для локального Docker-запуску всі потрібні dev-змінні вже описані в `docker-compose.yml`.

Якщо потрібні власні поштові налаштування або секрети, створіть локальний файл `server/.env` на основі `server/.env.example`. Цей файл не потрібно додавати в Git.

У Docker backend підключається до MySQL за назвою сервісу:

```env
DB_HOST=mysql
MYSQL_HOST=mysql
```

Всередині Docker не можна використовувати `localhost` для доступу до сусіднього контейнера бази даних.

## Production структура

У Dockerfile є два режими:

- `dev` - режим розробки з hot reload.
- `prod` - production-збірка без dev-залежностей.

Для клієнта production stage збирає React і віддає його через nginx.

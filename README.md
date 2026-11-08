# Ecommerce Platform

A Dockerized ecommerce marketplace with a React frontend, an Express backend, WebSocket chat, file uploads and MySQL storage.

## Quick Start

Requirements:

- Docker Desktop
- Git

The full project is started with the following commands:

```bash
git clone https://github.com/dmbondaren/ecommerce-platform.git
cd ecommerce-platform
docker compose up --build
```

After startup, the services are available at:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- MySQL: localhost:3307

## Local Admin

On the first backend start, the application creates a local development super admin:

```text
email: admin@admin-ch
password: 123sp
```

For deployment on a public server, these values must be overridden with environment variables before the first start:

```env
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=example-strong-password
```

## Data

The MySQL database is created automatically by Docker Compose. Sequelize creates and updates the tables on backend startup.

Uploaded files are stored in:

```text
server/uploads
```

Static UI images and icons are stored in the repository under:

```text
client/public/media
```

Installed dependencies such as `node_modules` are not committed. Docker installs them inside named volumes during setup.

## Optional Email Setup

SMTP is optional for local development. If the SMTP variables are empty, the application skips sending emails and logs the outgoing message instead.

Real email sending is enabled by setting the following environment variables locally or passing them to Docker:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASSWORD=example-app-password
```

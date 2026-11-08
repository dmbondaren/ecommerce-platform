# Ecommerce Platform

Dockerized ecommerce marketplace with React frontend, Express backend, WebSocket chat, file uploads, and MySQL storage.

## Quick Start

Requirements:

- Docker Desktop
- Git

Run the full project:

```bash
git clone https://github.com/dmbondaren/ecommerce-platform.git
cd ecommerce-platform
docker compose up --build
```

Open:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- MySQL: localhost:3307

## Local Admin

On the first backend start, the app creates a local development super admin:

```text
email: admin@admin-ch
password: 123sp
```

For a public server, override these values with environment variables before the first start:

```env
SUPER_ADMIN_EMAIL=your-admin-email@example.com
SUPER_ADMIN_PASSWORD=change-this-password
```

## Data

The MySQL database is created automatically by Docker Compose. Sequelize creates and updates the tables on backend startup.

Uploaded files are stored in:

```text
server/uploads
```

Static UI images and icons are committed in:

```text
client/public/media
```

Installed dependencies such as `node_modules` are not committed. Docker installs them inside named volumes during setup.

## Optional Email Setup

SMTP is optional for local development. If SMTP variables are empty, the app skips sending emails and logs the outgoing message.

To enable real email sending, create local environment values or pass them to Docker:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```


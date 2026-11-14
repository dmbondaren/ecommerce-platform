# Marketplace

A peer-to-peer marketplace for second-hand goods: people publish listings, talk to each other in real time, buy, and review the seller afterwards. Moderators keep the place clean.

It started as my bachelor's thesis (Express + Sequelize + MySQL, one 1 000-line React component) and was rewritten from the ground up as a typed, tested, containerised application.

[![CI](https://github.com/dmbondaren/ecommerce-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/dmbondaren/ecommerce-platform/actions/workflows/ci.yml)

## Features

**Buying and selling**
- Listings with up to ten photos, categories, price in CHF / EUR / USD / UAH
- Search with filters, sorting and pagination; the state lives in the URL, so a search can be shared
- Favourites, cart, browsing history, notifications when a saved item gets cheaper
- Checkout that reserves an item for exactly one buyer, even when two people buy at the same moment
- Simulated payment in the style of a peer-to-peer trade: transfer details by e-mail, a 15-minute countdown, an “I have paid” confirmation, and automatic release of unpaid reservations
- Optional map position per listing (Leaflet and OpenStreetMap), found from the address or placed by hand
- Sales analytics for sellers: revenue, average sale and a six-month chart
- Reviews tied to a real purchase, with votes and replies

**Communication**
- Real-time chat between buyer and seller (WebSocket), with photos, editing and deleting
- Support chat with the moderation team
- In-app notifications and transactional e-mail

**Moderation**
- Roles: user, admin, super admin
- Automatic screening of new and edited listings (prohibited items, off-platform payment requests, link spam); flagged ones wait for a moderator
- Reports, a moderation queue, temporary and permanent suspensions
- An audit log of every moderation action

## Tech stack

| | |
|---|---|
| **API** | Node.js 22, TypeScript (strict), Express 5, Prisma, PostgreSQL 17, Zod, `ws`, Pino |
| **Web client** | React 19, TypeScript (strict), Vite, React Router, TanStack Query, Leaflet, hand-written CSS with design tokens, switchable light and dark theme |
| **Quality** | Vitest, Supertest against a real database, ESLint, Prettier, GitHub Actions |
| **Operations** | Docker (multi-stage, non-root), Docker Compose, nginx, health checks, graceful shutdown |

## Architecture

```
            browser
               │  one origin: /, /api, /uploads, /ws
               ▼
     nginx (prod) / Vite (dev)
        │                  │
  static client        Express API ── WebSocket hub
                           │
                       PostgreSQL
```

```
server/
  prisma/schema.prisma      data model
  src/
    config/                 environment validation (the app refuses to start when misconfigured)
    lib/                    errors, logger, validation helpers
    middleware/             authentication, rate limits, error handler
    modules/                one folder per feature: routes -> service -> database
      auth/ users/ listings/ orders/ reviews/
      conversations/ reports/ notifications/ admin/ uploads/
    realtime/               WebSocket server and event hub
  tests/                    unit and integration tests

client/
  src/
    api/                    typed HTTP client and endpoints
    app/                    session, query cache, real-time updates, toasts
    components/             shared UI
    pages/                  one file per screen
```

### Decisions worth explaining

- **Sessions.** A 15-minute access token is kept in memory; the refresh token is an `HttpOnly` cookie scoped to the auth routes. Refresh tokens are stored hashed and rotated on every use, and presenting an already-used one revokes all sessions of that user (theft detection).
- **Bans take effect immediately.** Role and ban status are read from the database on each request instead of being trusted from the token.
- **Checkout is a conditional update.** `UPDATE … WHERE status = 'ACTIVE'` inside a transaction is the lock, so there is no window in which two buyers can both succeed. An integration test fires two purchases concurrently to prove it.
- **Reservations expire safely.** Confirming a payment and expiring a reservation are both conditional updates on the order status, and the deadline is part of the confirmation's condition, so a late click cannot win against the background job that releases unpaid items.
- **Orders are snapshots.** Title, price and photos are copied into the order, so the purchase history survives edits and deleted accounts.
- **Messages go over HTTP, events over WebSocket.** Sending is validated, rate-limited and answered with a status code; the socket only pushes results. The client turns events into cache invalidations, so no screen knows about the socket.
- **Uploads.** File names are generated on the server, the extension comes from an allow-list, and the API only accepts image URLs that its own upload endpoint produced.
- **Errors.** Every error leaves the API as `{ error: { code, message, details } }`; unknown errors are logged and answered with a generic 500. On the client an error boundary, per-query error states with retry, and toasts for failed actions mean a failure never ends in a blank page.
- **No account enumeration.** Login and password reset answer the same way whether or not the e-mail exists, and login takes the same time in both cases.

## Running it locally

Requirements: Node.js 22+ and Docker.

```bash
npm run setup                 # install server and client dependencies
docker compose up -d db       # PostgreSQL on localhost:5432

cd server
cp .env.example .env          # then set JWT_ACCESS_SECRET to a long random string
npm run db:push               # create the tables
npm run db:seed               # optional: demo users and listings
npm run dev                   # API on http://localhost:5000

cd ../client
npm run dev                   # web client on http://localhost:5173
```

Demo accounts after seeding: `anna@example.com`, `luca@example.com`, `mia@example.com`, password `demo-password-123`.

Without SMTP settings the API logs e-mails instead of sending them, so the confirmation link of a new account appears in the server log. To get an administrator, set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in `server/.env` and restart.

Everything in containers instead: `docker compose up --build`, then open http://localhost:5173.

## Tests

```bash
cd server
npm run test:unit             # no database needed
npm test                      # also runs the integration suite; needs `docker compose up -d db`

cd ../client
npm test
```

The integration tests run against a separate `marketplace_test` database, which they create themselves, and refuse to run against a database whose name does not contain "test".

## API overview

Base path `/api/v1`. Authenticated requests carry `Authorization: Bearer <access token>`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/verify-email`, `/auth/password-reset/*` |
| Account | `GET/PATCH /me`, `GET /me/{listings,favorites,cart,history,purchases,sales,reports,notifications}` |
| Listings | `GET /listings`, `GET/PUT/DELETE /listings/:id`, `POST /listings`, `POST /listings/:id/{relist,view,reports}` |
| Orders and reviews | `POST /orders`, `POST /orders/:id/{confirm-payment,cancel,review}`, `GET /me/sales/summary`, `POST /reviews/:id/{vote,replies}` |
| Users | `GET /users/:id`, `/users/:id/listings`, `/users/:id/reviews` |
| Chat | `GET/POST /conversations`, `GET/POST /conversations/:id/messages`, `PATCH/DELETE /conversations/messages/:id` |
| Admin | `/admin/users`, `/admin/listings`, `/admin/reports`, `/admin/audit-log` |
| Other | `POST /uploads`, `GET /health`, `GET /health/ready`, WebSocket at `/ws` |

## Known limitations

- Payments are simulated: the buyer receives demo transfer details and confirms the payment by hand. There is no payment provider and no delivery integration.
- The automatic moderation is rule-based; it holds listings back for a human rather than judging them.
- Uploaded files are stored on the local disk; several API instances would need object storage and a shared event bus (e.g. Redis) for the WebSocket hub.
- Search uses `ILIKE`; PostgreSQL full-text search would be the next step for a large catalogue.

## Author

Dmytro Bondarenko — Zürich. Computer Engineering, NTU "Kharkiv Polytechnic Institute".

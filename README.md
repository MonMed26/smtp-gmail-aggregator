# SMTP Gmail Aggregator

Aggregate multiple Gmail accounts into a single SMTP relay to achieve higher daily sending limits. Each Gmail account has a limit of ~500 emails/day (free) or ~2000/day (Workspace) — this tool combines them all behind one endpoint.

```
Your App ──► Aggregator (SMTP / API) ──► Load Balancer ──► Gmail #1
                                                       ──► Gmail #2
                                                       ──► Gmail #3
                                                       ──► Gmail #N
```

## Features

- **Built-in SMTP Server** — Any app that supports SMTP can connect directly (port 587)
- **REST API** — Send emails via HTTP with API key authentication
- **Web Dashboard** — Manage accounts, compose emails, monitor queue & logs
- **3 Load Balancing Strategies** — Round Robin, Least Used, Random (configurable per request)
- **Persistent Email Queue** — SQLite-based queue with background worker, retry logic (max 3 attempts)
- **Daily Limit Tracking** — Per-account usage tracking, auto-skips accounts that hit their limit
- **Encrypted Credentials** — App Passwords stored with AES-256-GCM encryption
- **Docker Support** — Single container deployment with docker-compose

## Quick Start

### Prerequisites

- Node.js 18+
- Gmail account(s) with [App Passwords](https://myaccount.google.com/apppasswords) enabled (requires 2FA)

### Install & Run

```bash
git clone https://github.com/MonMed26/smtp-gmail-aggregator.git
cd smtp-gmail-aggregator
npm install
cp .env.example .env
```

Edit `.env` and set your keys (or leave blank for auto-generated values in dev mode):

```env
ENCRYPTION_KEY=       # 64-char hex, generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
API_KEY=              # any random string
DASHBOARD_PASS=       # dashboard login password
SESSION_SECRET=       # any random string
SMTP_SERVER_PASS=     # password for SMTP relay auth
```

Build and start:

```bash
npm run build
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will print all credentials on startup:

```
SMTP Gmail Aggregator
-------------------------------------------
HTTP Dashboard: http://localhost:3000
REST API:       http://localhost:3000/api
SMTP Server:    smtp://localhost:587
SMTP Mode:      direct
===========================================
```

### Docker

```bash
# Make sure .env is configured
docker compose up -d

# View logs
docker compose logs -f

# Rebuild after code changes
docker compose up -d --build
```

## Usage

### 1. Add Gmail Accounts

**Via Dashboard:** Open `http://localhost:3000` → Accounts → Add account

**Via API:**
```bash
curl -X POST http://localhost:3000/api/accounts \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-gmail@gmail.com",
    "app_password": "xxxx xxxx xxxx xxxx",
    "display_name": "My Gmail",
    "daily_limit": 500
  }'
```

### 2. Send Emails

#### Via SMTP (recommended for app integration)

Connect any app to the aggregator as a standard SMTP server:

```
Host:     localhost
Port:     587
Username: aggregator
Password: (your SMTP_SERVER_PASS)
```

**PHP example:**
```php
$socket = fsockopen('localhost', 587);
// ... standard SMTP commands (EHLO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA)
```

**Nodemailer example:**
```javascript
const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 587,
  secure: false,
  auth: { user: 'aggregator', pass: 'your-smtp-pass' }
});

await transporter.sendMail({
  to: 'recipient@example.com',
  subject: 'Hello',
  html: '<p>Sent via aggregator!</p>'
});
```

**Laravel `.env`:**
```env
MAIL_MAILER=smtp
MAIL_HOST=localhost
MAIL_PORT=587
MAIL_USERNAME=aggregator
MAIL_PASSWORD=your-smtp-pass
MAIL_ENCRYPTION=null
```

#### Via REST API

```bash
# Single email
curl -X POST http://localhost:3000/api/send \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "subject": "Hello",
    "html": "<h1>Hello!</h1>",
    "strategy": "least-used"
  }'

# Bulk (up to 100)
curl -X POST http://localhost:3000/api/send/bulk \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [
      { "to": "user1@example.com", "subject": "Hi", "text": "Hello 1" },
      { "to": "user2@example.com", "subject": "Hi", "text": "Hello 2" }
    ]
  }'
```

#### Via Dashboard

Open `http://localhost:3000` → Send Email → Fill form → Queue Email

## API Reference

### Email

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/send` | Queue single email |
| `POST` | `/api/send/bulk` | Queue multiple emails (max 100) |
| `GET` | `/api/queue` | List queue items (`?status=pending&page=1`) |
| `GET` | `/api/queue/:id` | Get queue item details |
| `DELETE` | `/api/queue/:id` | Cancel queued email |
| `POST` | `/api/queue/:id/retry` | Retry failed email |

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts` | List all accounts |
| `POST` | `/api/accounts` | Add Gmail account |
| `PUT` | `/api/accounts/:id` | Update account |
| `DELETE` | `/api/accounts/:id` | Delete account |
| `POST` | `/api/accounts/:id/test` | Test SMTP connection |

### Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stats` | Overview statistics |
| `GET` | `/api/stats/accounts` | Per-account statistics |
| `GET` | `/api/stats/daily` | Daily trends (`?days=30`) |

All API endpoints require `X-API-Key` header.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `ENCRYPTION_KEY` | auto | 64-char hex key for AES-256-GCM |
| `API_KEY` | auto | API authentication key |
| `DASHBOARD_USER` | `admin` | Dashboard login username |
| `DASHBOARD_PASS` | auto | Dashboard login password |
| `DEFAULT_STRATEGY` | `round-robin` | Default load balancing (`round-robin`, `least-used`, `random`) |
| `QUEUE_POLL_INTERVAL` | `5000` | Queue worker poll interval (ms) |
| `QUEUE_BATCH_SIZE` | `10` | Emails processed per batch |
| `SMTP_SERVER_ENABLED` | `true` | Enable/disable SMTP relay server |
| `SMTP_SERVER_PORT` | `587` | SMTP server listen port |
| `SMTP_SERVER_USER` | `aggregator` | SMTP auth username |
| `SMTP_SERVER_PASS` | auto | SMTP auth password |
| `SMTP_SERVER_MODE` | `direct` | `direct` = send immediately, `queue` = background processing |

## Architecture

```
src/
├── config/          # Environment configuration
├── database/        # SQLite connection & migrations
├── middleware/       # Auth, rate limiting, error handling
├── models/          # Account, EmailQueue, EmailLog (SQLite)
├── routes/          # API routes + Dashboard routes
├── services/
│   ├── smtp-pool    # Outgoing SMTP connections to Gmail
│   ├── smtp-server  # Incoming SMTP relay server
│   ├── email        # Send orchestration
│   ├── queue-worker # Background queue processor
│   ├── load-balancer# Strategy-based account selection
│   ├── usage-tracker# Daily limit tracking
│   └── encryption   # AES-256-GCM for stored passwords
├── strategies/      # Round Robin, Least Used, Random
└── types/           # TypeScript interfaces
```

## License

MIT

# Deployment Guide

This guide covers deploying the Medical SaaS Boilerplate to a production server using Docker Compose, with alternatives for Vercel and VPS deployments.

---

## Prerequisites

- A production server (VPS, dedicated, or cloud VM) with:
  - **Docker Engine** 24+ (`curl -fsSL https://get.docker.com | sh`)
  - **Docker Compose** v2+ (bundled with Docker Engine)
  - **Git** (`apt install git`)
  - At least 1 GB RAM, 10 GB disk
- A domain name with DNS A record pointing to your server's IP.
- (Optional) An SSL certificate (Let's Encrypt via Caddy, Nginx, or Traefik).

---

## 1. Generate Secrets

The app will refuse to start without valid secrets. Generate them with `openssl`:

```bash
# JWT_SECRET (min 32 chars, recommend 64 hex chars = 32 bytes)
openssl rand -hex 32

# ENCRYPTION_KEY (exactly 64 hex chars = 32 bytes for AES-256)
openssl rand -hex 32

# PAYMENT_WEBHOOK_SECRET (min 16 chars)
openssl rand -hex 16

# PostgreSQL password
openssl rand -hex 16

# Admin password (for first login)
openssl rand -base64 18
```

Store these in a password manager. You will need them in the next steps.

---

## 2. Server Setup

SSH into your server:

```bash
ssh user@your-server-ip
```

Clone the repository:

```bash
sudo mkdir -p /opt/medical-saas
sudo chown $USER:$USER /opt/medical-saas
cd /opt/medical-saas
git clone https://github.com/frangelbarrera/medical-saas-fullstack-boilerplate.git .
```

Create the `.env` file (this file is gitignored — never commit it):

```bash
cp .env.example .env
nano .env
```

Fill in the values:

```env
# Server
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-domain.com

# PostgreSQL
PGHOST=db
PGPORT=5432
PGUSER=medical_saas
PGPASSWORD=<your-strong-postgres-password>
PGDATABASE=medical_saas_prod

# Required secrets (no defaults — app crashes if missing)
JWT_SECRET=<64-hex-chars-from-openssl>
ENCRYPTION_KEY=<64-hex-chars-from-openssl>
PAYMENT_WEBHOOK_SECRET=<16+ chars from openssl>

# First admin provisioning
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<your-strong-admin-password>
ADMIN_NAME=System Administrator
ADMIN_CLINIC_ID=clinic_default
ADMIN_CLINIC_NAME=Default Clinic

# Optional integrations
GEMINI_API_KEY=<your-gemini-api-key-or-leave-empty>
PAYMENT_GATEWAY_TOKEN=<your-payphone-or-stripe-token>
PAYMENT_GATEWAY_URL=https://pay.payphone.com.ec/api/button/Prepare
LLM_PHI_MODE=strip
```

---

## 3. Initialize the Database

The first time you deploy, you need to apply the production SQL schema:

```bash
# Start only the database container
docker compose up -d db

# Wait for it to be healthy (10-15 seconds)
docker compose ps

# Apply the schema
docker compose exec db psql -U medical_saas -d medical_saas_prod -f /dev/stdin < schema.sql

# Verify
docker compose exec db psql -U medical_saas -d medical_saas_prod -c "\dt"
```

You should see ~10 tables: `clinics`, `users`, `patients`, `appointments`, `consultations`, `invoices`, `expenses`, `ai_chats`, `audit_logs`, `icd10_catalog`.

---

## 4. Start the Application

```bash
docker compose up -d --build
```

This will:
- Build the app image (multi-stage, non-root user).
- Start the `app` container on port 3000.
- Start the `db` container (if not already running).
- Wait for the database to be healthy before starting the app.

Check that everything is running:

```bash
docker compose ps
docker compose logs app --tail 30
```

You should see:
```
[db] Connected to PostgreSQL successfully.
[db] Initial admin 'admin' provisioned. Change the password immediately after first login.
🚀 Server running on http://localhost:3000
```

---

## 5. Set Up a Reverse Proxy with TLS

The app listens on port 3000. You need a reverse proxy to:
- Terminate TLS (HTTPS)
- Redirect HTTP to HTTPS
- Proxy requests to the app

### Option A: Caddy (recommended — automatic HTTPS)

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Edit `/etc/caddy/Caddyfile`:

```
your-domain.com {
    reverse_proxy localhost:3000
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

Caddy will automatically obtain a Let's Encrypt certificate and redirect HTTP to HTTPS.

### Option B: Nginx + Certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/medical-saas`:

```nginx
server {
    server_name your-domain.com;
    client_max_body_size 1m;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and obtain a certificate:

```bash
sudo ln -s /etc/nginx/sites-available/medical-saas /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

---

## 6. Configure the Payment Webhook

1. Log in to your Payphone (or Stripe) dashboard.
2. Set the webhook URL to `https://your-domain.com/api/webhooks/payment`.
3. Copy the webhook signing secret.
4. Add it to your `.env` as `PAYMENT_WEBHOOK_SECRET`.
5. Restart the app: `docker compose restart app`.

---

## 7. First Login and Post-Deploy Checklist

1. Visit `https://your-domain.com` in your browser.
2. Log in with `ADMIN_USERNAME` and `ADMIN_PASSWORD` from your `.env`.
3. **Immediately change the admin password** via Settings → User Management.
4. Verify the audit log records your login (Settings → Audit Logs, admin-only).
5. Test creating a patient, appointment, and consultation.
6. Test the payment flow (if `PAYMENT_GATEWAY_TOKEN` is set).
7. Run the test suite against the production-like env to verify nothing regressed:

```bash
# Locally, against your production endpoint
JWT_SECRET=<your-jwt-secret> ENCRYPTION_KEY=<your-key> \
PAYMENT_WEBHOOK_SECRET=<your-secret> FRONTEND_URL=https://your-domain.com \
npm test
```

---

## 8. Set Up CI/CD (Optional)

To automate deployments on every push to `main`:

1. In your GitHub repo, go to **Settings → Secrets and variables → Actions**.
2. Add these secrets:
   - `SERVER_HOST` — your server's IP or hostname
   - `SERVER_USER` — SSH username
   - `SERVER_SSH_KEY` — SSH private key (PEM format)
   - `DEPLOY_PATH` — absolute path to the app directory (e.g. `/opt/medical-saas`)
3. The provided `.github/workflows/deploy.yml` will SSH into your server, pull the latest code, and rebuild the containers.

---

## 9. Backup Strategy

### Database Backups

Set up a cron job to dump the database daily:

```bash
# Edit crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * docker compose -f /opt/medical-saas/docker-compose.yml exec -T db pg_dump -U medical_saas medical_saas_prod | gzip > /opt/backups/medical_saas_$(date +\%Y\%m\%d).sql.gz
```

### Retention

HIPAA requires 6 years of records. Configure log rotation and backup retention accordingly:

```bash
# Keep 30 days of database backups locally; archive older ones to cold storage
find /opt/backups -name "medical_saas_*.sql.gz" -mtime +30 -exec mv {} /archive/backups/ \;
```

### Test Restore

A backup that has never been restored is not a backup. Test restores quarterly:

```bash
# Restore test
gunzip < /opt/backups/medical_saas_2026-01-01.sql.gz | docker compose exec -T db psql -U medical_saas medical_saas_test
```

---

## 10. Monitoring

- **Healthcheck**: The Dockerfile includes a `HEALTHCHECK` that probes `/api/auth/me`. Docker will mark the container unhealthy if it stops responding.
- **Logs**: `docker compose logs -f app` for application logs. `docker compose logs -f db` for database logs.
- **Audit logs**: Available in-app at Settings → Audit Logs (admin only). For production, consider forwarding audit logs to a SIEM (Splunk, ELK, Datadog).
- **Uptime**: Use UptimeRobot or BetterUptime to monitor `https://your-domain.com/api/auth/me` (returns 401 if the server is up).

---

## 11. Alternative Deployment: Vercel (Frontend Only)

The frontend can be deployed to Vercel as a static site. The backend must run on a VPS or serverless function (Vercel Functions, Cloud Run, AWS Lambda).

### Frontend on Vercel

1. Import the repo into Vercel.
2. Set the framework to **Vite**.
3. Set the build command to `npm run build`.
4. Set the output directory to `dist`.
5. Set the env var `VITE_API_BASE_URL` to your backend URL (e.g. `https://api.your-domain.com`).
6. Update `src/lib/api.ts` to use `VITE_API_BASE_URL` instead of `/api`:

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
```

### Backend on a VPS

The backend (server.ts) needs a long-running process, so deploy it on a VPS as described in steps 1-7 above.

---

## 12. Local AI Infrastructure (Optional, On-Premise)

To run AI features without sending data to Google Gemini:

### A. LLM Inference (Llama 3 via Ollama)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model
ollama pull llama3:8b-instruct

# Expose on localhost:11434 (default)
```

### B. Speech-to-Text (Whisper)

```bash
# Use faster-whisper-server
docker run -d --gpus all -p 8000:8000 \
  fedirz/faster-whisper-server:latest
```

### C. Wire into the App

Update `src/lib/ai-service.ts` to point to `http://localhost:11434` instead of the Gemini API. Set `LLM_PHI_MODE=passthrough` since the LLM is on-prem (no BAA needed).

---

## Troubleshooting

### App crashes on startup with "Invalid environment variables"
- Check that all required env vars are set: `JWT_SECRET` (32+ chars), `ENCRYPTION_KEY` (64 hex chars), `PAYMENT_WEBHOOK_SECRET` (16+ chars).
- The error message will tell you which var failed validation.

### Database connection fails
- Verify the `db` container is healthy: `docker compose ps`.
- Verify `PGHOST=db` (the Docker service name, not `localhost`).
- Verify `PGUSER`, `PGPASSWORD`, `PGDATABASE` match the values in the `db` service's `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.

### CSRF errors (403) on every request
- Make sure the frontend is sending the `x-csrf-token` header for POST/PUT/DELETE.
- The token is returned in the login response body and set as a cookie.
- The frontend (`src/lib/api.ts`) reads it from memory first, then falls back to the cookie.

### Webhook returns 401
- Verify `PAYMENT_WEBHOOK_SECRET` is set and matches the secret configured at the payment gateway.
- Verify the gateway is sending the signature in the `X-Signature` (or `X-Payphone-Signature`) header.
- The signature is HMAC-SHA256 of the raw request body, hex-encoded.

### Cannot log in (401)
- Verify `ADMIN_USERNAME` and `ADMIN_PASSWORD` were set when the database was initialized.
- If you forgot, exec into the db and delete the admin user, then restart the app to re-seed.
- Verify the password is being typed correctly (it's case-sensitive).

### Patients/Apointments return empty lists
- This is expected on a fresh database. Use the "Populate with Test Data" button in Settings to generate synthetic data (admin only).

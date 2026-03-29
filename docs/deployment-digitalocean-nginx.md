# Deploy on DigitalOcean VPS with Nginx

This guide deploys the app with Docker Compose on a VPS, then exposes it through Nginx with your domain and HTTPS.

## 1) Prerequisites

- Ubuntu 22.04+ VPS (recommended)
- Domain name you control
- SSH access to VPS

## 2) Base server setup

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg ufw nginx certbot python3-certbot-nginx
```

Create a deploy user (optional but recommended):

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
```

Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 3) Install Docker + Compose plugin

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker --version
sudo docker compose version
```

## 4) Get the project on the VPS

```bash
sudo mkdir -p /opt/itec2026
sudo chown -R $USER:$USER /opt/itec2026
git clone <YOUR_REPO_URL> /opt/itec2026
cd /opt/itec2026
```

## 5) Create production env file

Use the provided template:

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and fill all real values:

- `PUBLIC_APP_URL` (for example `https://app.yourdomain.com`)
- `POSTGRES_PASSWORD`
- Auth0 values (`AUTH0_*`, `VITE_AUTH0_*`)
- Optional AI key (`DEEPSEEK_API_KEY`)

## 6) Start application stack

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
sudo docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Quick checks from VPS:

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.production logs -f postgres
sudo docker compose -f docker-compose.prod.yml --env-file .env.production logs -f dockerd
sudo docker compose -f docker-compose.prod.yml --env-file .env.production logs -f server
```

Wait until server is healthy, then validate locally:

```bash
curl -I http://127.0.0.1:3000
curl -s http://127.0.0.1:4000/health
```

## 7) Point domain DNS to VPS

At your DNS provider, create `A` record(s):

- `app.yourdomain.com` -> `<YOUR_VPS_PUBLIC_IP>`

Wait for propagation, then verify:

```bash
dig +short app.yourdomain.com
```

## 8) Configure Nginx reverse proxy

Copy example config and replace domain:

```bash
sudo cp deploy/nginx/itec2026.conf.example /etc/nginx/sites-available/itec2026
sudo nano /etc/nginx/sites-available/itec2026
```

Set `server_name` to your real domain.

Enable site:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/itec2026 /etc/nginx/sites-enabled/itec2026
sudo nginx -t
sudo systemctl reload nginx
```

## 9) Enable HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx --redirect -d app.yourdomain.com
```

Test renewal:

```bash
sudo certbot renew --dry-run
```

## 10) Operations and useful commands

Restart app:

```bash
cd /opt/itec2026
sudo docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

View logs:

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.production logs -f server
sudo docker compose -f docker-compose.prod.yml --env-file .env.production logs -f client
```

Stop app:

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.production down
```

## Notes

- This is the default deployment path requested: Docker Compose stack behind Nginx.
- Production compose uses `npm run preview` for client and a built server runtime (`npm run start:docker:prod`).
- The server has Docker daemon access by design for collaborative terminal sandboxing. Treat the server container as highly trusted, keep the host patched, and do not expose Docker daemon ports publicly.
- `dockerd` is internal for workspace sandboxing. Do not expose it publicly.

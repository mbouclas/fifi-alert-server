# nginx for app.fifi-alert.com

The API listens on `127.0.0.1:3113` as the `fifi-alert-api` container from `docker-compose.prod.yml` (deployed with `./deploy.sh`). nginx terminates TLS and proxies to it.

## First install (no certificate yet)

```bash
cd ~/sites/fifi-alert/fifi-alert-server
sudo cp nginx/app.fifi-alert.com.http-only /etc/nginx/sites-available/app.fifi-alert.com
sudo ln -s /etc/nginx/sites-available/app.fifi-alert.com /etc/nginx/sites-enabled/app.fifi-alert.com
sudo nginx -t && sudo systemctl reload nginx
curl -I http://app.fifi-alert.com/health          # expect 200 once DNS points here

sudo certbot --nginx -d app.fifi-alert.com
```

certbot rewrites the file with the SSL block. If you prefer the hand-written version:

```bash
sudo cp nginx/app.fifi-alert.com /etc/nginx/sites-available/app.fifi-alert.com
sudo nginx -t && sudo systemctl reload nginx
```

## Verify

```bash
curl https://app.fifi-alert.com/health
curl -I https://app.fifi-alert.com/api        # swagger UI
```

## On boot

All three containers (`fifi-alert-api`, `fifi-alert-postgres`, `fifi-alert-redis`) have `restart: always`, so the Docker daemon brings them back after a reboot. No process manager is involved.

Until 2026-10-17 the API ran on the host under pm2 (`ecosystem.prod.config.cjs`). `deploy.sh` removes that pm2 entry the first time it runs on a host that still has it. If `pm2 list` still shows `fifi-alert-server`, delete it by hand: it would fight the container for port 3113.

## Logs

```bash
docker logs -f fifi-alert-api                       # stdout (Nest + winston console)
ls ~/sites/fifi-alert/fifi-alert-server/logs        # winston files, bind-mounted from the container
```

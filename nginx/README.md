# nginx for app.fifi-alert.com

The API listens on `127.0.0.1:3113` (pm2, see `ecosystem.prod.config.cjs`). nginx terminates TLS and proxies to it.

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

## Process manager on boot

pm2 is installed under nvm (`source ~/.nvm/nvm.sh && nvm use 22`). To resurrect on reboot run once, as the deploy user:

```bash
source ~/.nvm/nvm.sh && nvm use 22
pm2 startup      # prints a sudo command — run it
pm2 save
```

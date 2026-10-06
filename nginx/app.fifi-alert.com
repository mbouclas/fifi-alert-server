# fifi-alert API — app.fifi-alert.com
# Install: sudo cp nginx/app.fifi-alert.com /etc/nginx/sites-available/ && sudo ln -s /etc/nginx/sites-available/app.fifi-alert.com /etc/nginx/sites-enabled/
# Requires the Let's Encrypt cert to exist already (see nginx/README.md; use the .http-only file first).

server {
    listen 80;
    listen [::]:80;
    server_name app.fifi-alert.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    server_name app.fifi-alert.com;
    listen 443 ssl http2;
    listen [::]:443 ssl http2;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Photo uploads (MAX_FILE_SIZE 10MB, several files per request)
    client_max_body_size 25M;

    location / {
        proxy_connect_timeout       600;
        proxy_send_timeout          600;
        proxy_read_timeout          600;
        send_timeout                600;

        proxy_pass http://127.0.0.1:3113;
        proxy_http_version 1.1;

        # websockets (socket.io)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass $http_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }

    ssl_certificate /etc/letsencrypt/live/app.fifi-alert.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/app.fifi-alert.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

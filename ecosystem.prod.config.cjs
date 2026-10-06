// Production pm2 config. Start with:  pm2 start ecosystem.prod.config.cjs && pm2 save
const path = require('path');
const home = process.env.HOME || '/home/mbouclas';

module.exports = {
  apps: [
    {
      name: 'fifi-alert-server',
      script: 'src/main.ts',
      interpreter: path.join(home, '.bun/bin/bun'),
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      time: true,
      out_file: path.join(__dirname, 'logs/pm2-out.log'),
      error_file: path.join(__dirname, 'logs/pm2-error.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PATH: `${home}/.bun/bin:${process.env.PATH}`,
      },
    },
  ],
};

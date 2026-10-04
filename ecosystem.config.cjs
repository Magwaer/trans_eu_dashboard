module.exports = {
  apps: [
    {
      name: "lane-desk",
      cwd: __dirname,
      script: "server/dist/index.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

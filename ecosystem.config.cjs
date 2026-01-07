module.exports = {
  apps: [
    {
      name: "restaurant-pos",
      script: "dist/index.cjs",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      max_memory_restart: "500M",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      watch: false,
      ignore_watch: ["node_modules", "logs", "uploads"],
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      exp_backoff_restart_delay: 100,
    },
  ],
};

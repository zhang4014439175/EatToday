module.exports = {
  apps: [
    {
      name: 'eat-today-backend',
      script: 'server.js',
      instances: 1,                 // 2核2G 云服务器仅需单实例，节约系统资源
      autorestart: true,            // 发生异常退出时自动重启
      watch: false,                 // 生产环境下关闭文件监控
      max_memory_restart: '150M',    // 内存占用如果超过 150MB 则自动安全重启，保活防崩溃
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',  // 错误日志路径
      out_file: './logs/out.log',    // 标准输出日志路径
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};

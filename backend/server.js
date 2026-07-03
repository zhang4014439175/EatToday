import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import { initDB } from './db.js';
import authRouter from './routes/auth.js';
import anniversaryRouter from './routes/anniversary.js';
import foodRouter from './routes/food.js';
import dateRouter from './routes/date.js';
import kitchenRouter from './routes/kitchen.js';
import calendarRouter from './routes/calendar.js';
import spaceRouter from './routes/space.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { initWebSocketServer } from './services/websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// 配置中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 挂载路由
app.use('/api/auth', authRouter);
app.use('/api/anniversary', anniversaryRouter);
app.use('/api/food', foodRouter);
app.use('/api/date', dateRouter);
app.use('/api/kitchen', kitchenRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/spaces', spaceRouter);

// 初始化 WebSocket 服务
initWebSocketServer(server);

// GET /health 健康检查接口
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'
  });
});

// 启动数据库并开启监听服务
async function startServer() {
  try {
    await initDB();
    server.listen(PORT, () => {
      console.log(`========================================`);
      console.log(`EatToday Backend is running on port: ${PORT}`);
      console.log(`Health Check URL: http://localhost:${PORT}/health`);
      console.log(`========================================`);
    });
  } catch (error) {
    console.error('Failed to start EatToday backend server:', error);
    process.exit(1);
  }
}

startServer();

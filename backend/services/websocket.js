import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { getDB } from '../db.js';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'eat_today_default_secret_key_change_me_in_production';

// 内存中维护在线用户的 Socket 映射: userId -> WebSocket实例
const activeConnections = new Map();

/**
 * 初始化 WebSocket 服务
 * @param {object} server HTTP Server 实例
 */
export function initWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  // 将 WebSocket 挂载到现有的 HTTP 协议升级监听上
  server.on('upgrade', (request, socket, head) => {
    try {
      const urlObj = new URL(request.url, `http://${request.headers.host}`);
      const token = urlObj.searchParams.get('token');

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // 验证 Token
      jwt.verify(token, TOKEN_SECRET, (err, decoded) => {
        if (err) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // 鉴权通过，允许协议升级
        wss.handleUpgrade(request, socket, head, (ws) => {
          ws.userId = decoded.id;
          wss.emit('connection', ws, request);
        });
      });
    } catch (error) {
      console.error('[WebSocket Upgrade] 升级协议错误:', error);
      socket.destroy();
    }
  });

  wss.on('connection', async (ws) => {
    const userId = ws.userId;
    console.log(`[WebSocket] 用户已连接. UserID: ${userId}`);

    // 1. 查询伴侣 ID
    const db = getDB();
    try {
      const user = await db.get('SELECT partner_id FROM users WHERE id = ?', [userId]);
      ws.partnerId = user ? user.partner_id : null;
    } catch (dbErr) {
      console.error('[WebSocket] 查询伴侣失败:', dbErr);
    }

    // 2. 保存连接
    activeConnections.set(userId, ws);
    ws.isAlive = true;

    // 监听心跳确认
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // 3. 监听客户端消息
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log(`[WebSocket] 收到来自 UserID: ${userId} 的消息:`, data);

        // 如果用户有绑定的伴侣，且伴侣目前在线，则将消息转发给伴侣
        if (ws.partnerId) {
          const partnerWs = activeConnections.get(ws.partnerId);
          if (partnerWs && partnerWs.readyState === WebSocket.OPEN) {
            partnerWs.send(JSON.stringify({
              type: data.type,       // 消息类型，如: 'wheel_spin', 'wheel_stop', 'vote_status'
              senderId: userId,
              payload: data.payload  // 消息荷载（如旋转角度，匹配的菜品等）
            }));
          }
        }
      } catch (err) {
        console.error('[WebSocket] 解析消息失败:', err);
      }
    });

    // 4. 断开连接释放内存
    ws.on('close', () => {
      console.log(`[WebSocket] 用户断开连接. UserID: ${userId}`);
      activeConnections.delete(userId);
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] 连接异常. UserID: ${userId}:`, err);
      activeConnections.delete(userId);
    });
  });

  // 30秒定时心跳机制，清理死链接
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log(`[WebSocket Heartbeat] 清理不活动连接. UserID: ${ws.userId}`);
        activeConnections.delete(ws.userId);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
}

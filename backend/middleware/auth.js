import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getDB } from '../db.js';

dotenv.config();

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'eat_today_default_secret_key_change_me_in_production';

/**
 * JWT 登录凭证校验中间件
 */
export async function authMiddleware(req, res, next) {
  let token = req.headers['authorization'] || req.headers['x-token'] || req.headers['token'];

  // 处理 Authorization: Bearer <token> 格式
  if (token && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: '缺少登录凭证 Token'
    });
  }

  try {
    // 校验并解码 JWT
    const decoded = jwt.verify(token, TOKEN_SECRET);
    
    // 注入数据库实例并核对用户在库中是否仍然存在
    const db = getDB();
    const user = await db.get(
      'SELECT id, openid, nickname, avatar_url, partner_id, pair_code FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '用户已被删除或不存在，请重新登录'
      });
    }

    // 将用户信息挂载到 req.user，后续路由可以直接使用
    req.user = user;
    next();
  } catch (error) {
    console.warn('[Auth Middleware] Token 验证失败:', error.message);
    return res.status(401).json({
      error: 'Unauthorized',
      message: '登录凭证无效或已过期，请重新登录'
    });
  }
}

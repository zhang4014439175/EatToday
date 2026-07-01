import express from 'express';
import jwt from 'jsonwebtoken';
import { getDB, ensureUserHasSpace } from '../db.js';
import { code2Session } from '../services/wechat.js';
import { generateUniquePairCode, bindPartnerTransaction } from '../services/pairing.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'eat_today_default_secret_key_change_me_in_production';

// 配对码频次限制缓存 (简单内存限频，针对 2核2G 最省资源的方式，不需要外部缓存服务)
const pairRateLimitCache = new Map();

/**
 * 微信小程序登录 / 注册
 * POST /api/auth/login
 */
router.post('/login', async (req, res, next) => {
  const { code, nickname, avatarUrl } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'ValidationError', message: '缺少登录 code' });
  }

  try {
    const db = getDB();
    
    // 换取微信 openid
    const { openid } = await code2Session(code);
    
    let user = await db.get('SELECT * FROM users WHERE openid = ?', [openid]);
    const now = new Date().toISOString();

    if (user) {
      // 用户已存在，如有传入新昵称/头像则更新
      if (nickname || avatarUrl) {
        await db.run(
          'UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url), updated_at = ? WHERE id = ?',
          [nickname, avatarUrl, now, user.id]
        );
        user = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
      }
    } else {
      // 用户不存在，执行注册
      const pairCode = await generateUniquePairCode(db);
      
      const result = await db.run(
        `INSERT INTO users (openid, pair_code, pair_code_created_at, nickname, avatar_url, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [openid, pairCode, now, nickname || '神秘队友', avatarUrl || '', now, now]
      );
      
      user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
    }

    // 确保用户登录后拥有空间，没有则默认创建个人空间
    const currentSpaceId = await ensureUserHasSpace(db, user, now);
    user = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    const currentSpace = await db.get('SELECT * FROM spaces WHERE id = ?', [currentSpaceId]);

    // 签发 JWT (有效期 30 天)
    const token = jwt.sign({ id: user.id, openid: user.openid }, TOKEN_SECRET, { expiresIn: '30d' });

    // 剔除敏感字段后返回
    delete user.openid;

    return res.status(200).json({
      token,
      user,
      currentSpace
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取当前用户信息及伴侣信息
 * GET /api/auth/me
 */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const user = req.user;
    let partner = null;

    if (user.partner_id) {
      partner = await db.get(
        'SELECT id, nickname, avatar_url, pair_code, created_at FROM users WHERE id = ?',
        [user.partner_id]
      );
    }

    return res.status(200).json({
      user,
      partner
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 输入伴侣配对码完成绑定
 * POST /api/auth/pair
 */
router.post('/pair', authMiddleware, async (req, res, next) => {
  let { pairCode } = req.body;
  const user = req.user;

  if (!pairCode) {
    return res.status(400).json({ error: 'ValidationError', message: '请输入配对码' });
  }

  pairCode = pairCode.trim().toUpperCase();

  // 极简限频：防止暴力枚举配对码
  const nowTs = Date.now();
  const lastAttempt = pairRateLimitCache.get(user.id) || 0;
  if (nowTs - lastAttempt < 3000) {
    // 3秒内限制请求一次配对
    return res.status(429).json({ error: 'RateLimitError', message: '操作过于频繁，请稍候再试' });
  }
  pairRateLimitCache.set(user.id, nowTs);

  try {
    const db = getDB();

    // 1. 查询伴侣用户
    const partner = await db.get('SELECT id, nickname, avatar_url, partner_id FROM users WHERE pair_code = ?', [pairCode]);

    if (!partner) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该配对码对应的用户，请核对后再试' });
    }

    // 2. 调用绑定事务
    await bindPartnerTransaction(db, user.id, partner.id);

    return res.status(200).json({
      success: true,
      message: '恭喜！配对成功',
      partner: {
        id: partner.id,
        nickname: partner.nickname,
        avatar_url: partner.avatar_url
      }
    });
  } catch (error) {
    if (error.message.includes('已经绑定') || error.message.includes('自己')) {
      return res.status(400).json({ error: 'ValidationError', message: error.message });
    }
    next(error);
  }
});

/**
 * 与伴侣解除绑定关系
 * POST /api/auth/unpair
 */
router.post('/unpair', authMiddleware, async (req, res, next) => {
  const user = req.user;

  if (!user.partner_id) {
    return res.status(400).json({ error: 'ValidationError', message: '您当前未绑定伴侣，无需解绑' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    await db.run('BEGIN TRANSACTION;');
    try {
      // 解除自己的绑定
      await db.run('UPDATE users SET partner_id = NULL, updated_at = ? WHERE id = ?', [now, user.id]);
      // 解除对方的绑定
      await db.run('UPDATE users SET partner_id = NULL, updated_at = ? WHERE id = ?', [now, user.partner_id]);
      
      await db.run('COMMIT;');
    } catch (err) {
      await db.run('ROLLBACK;');
      throw err;
    }

    return res.status(200).json({
      success: true,
      message: '已解除情侣绑定关系'
    });
  } catch (error) {
    next(error);
  }
});

export default router;

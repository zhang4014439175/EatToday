import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * 获取情侣间当前活跃的厨房会话
 * GET /api/kitchen/active
 */
router.get('/active', authMiddleware, async (req, res, next) => {
  const user = req.user;
  if (!user.partner_id) {
    return res.status(200).json({ session: null });
  }

  try {
    const db = getDB();
    // 查找两个人之间最新的一条且状态不是 'archived' 的厨房会话
    const session = await db.get(
      `SELECT * FROM kitchen_sessions 
       WHERE ((diner_id = ? AND chef_id = ?) OR (diner_id = ? AND chef_id = ?)) 
         AND status != 'archived' 
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, user.partner_id, user.partner_id, user.id]
    );

    return res.status(200).json({ session: session || null });
  } catch (error) {
    next(error);
  }
});

/**
 * 食客下单点菜
 * POST /api/kitchen/order
 */
router.post('/order', authMiddleware, async (req, res, next) => {
  const { dish_name, diner_note } = req.body;
  const user = req.user;

  if (!user.partner_id) {
    return res.status(400).json({ error: 'ValidationError', message: '您还没有绑定伴侣，无法发起点单。' });
  }

  if (!dish_name || !dish_name.trim()) {
    return res.status(400).json({ error: 'ValidationError', message: '点单菜名不能为空。' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    // 检查是否已存在未归档的厨房会话
    const existing = await db.get(
      `SELECT id FROM kitchen_sessions 
       WHERE ((diner_id = ? AND chef_id = ?) OR (diner_id = ? AND chef_id = ?)) 
         AND status != 'archived' 
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, user.partner_id, user.partner_id, user.id]
    );

    if (existing) {
      return res.status(400).json({ error: 'ConflictError', message: '当前已有正在进行中的爱心订单。' });
    }

    const result = await db.run(
      `INSERT INTO kitchen_sessions (dish_name, diner_id, chef_id, diner_note, chef_note, status, image_url, praise, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dish_name.trim(), user.id, user.partner_id, diner_note || '', '', 'ordered', '', '', now, now]
    );

    const session = await db.get('SELECT * FROM kitchen_sessions WHERE id = ?', [result.lastID]);
    return res.status(201).json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

/**
 * 大厨接单
 * POST /api/kitchen/accept
 */
router.post('/accept', authMiddleware, async (req, res, next) => {
  const user = req.user;

  try {
    const db = getDB();
    // 查找必须是以当前用户为大厨 (chef_id) 且状态为 'ordered' 的会话
    const session = await db.get(
      `SELECT * FROM kitchen_sessions 
       WHERE chef_id = ? AND status = 'ordered' 
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'NotFoundError', message: '没有等待您接单的爱心订单。' });
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE kitchen_sessions SET status = 'cooking', updated_at = ? WHERE id = ?`,
      [now, session.id]
    );

    const updated = await db.get('SELECT * FROM kitchen_sessions WHERE id = ?', [session.id]);
    return res.status(200).json({ success: true, session: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * 大厨起锅上菜 (起锅装盘)
 * POST /api/kitchen/serve
 */
router.post('/serve', authMiddleware, async (req, res, next) => {
  const { chef_note, image_url } = req.body;
  const user = req.user;

  try {
    const db = getDB();
    // 必须是当前用户为大厨且状态为 'cooking' 的会话
    const session = await db.get(
      `SELECT * FROM kitchen_sessions 
       WHERE chef_id = ? AND status = 'cooking' 
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'NotFoundError', message: '没有正在烹饪中的爱心订单。' });
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE kitchen_sessions SET status = 'served', chef_note = ?, image_url = ?, updated_at = ? WHERE id = ?`,
      [chef_note || '', image_url || '', now, session.id]
    );

    const updated = await db.get('SELECT * FROM kitchen_sessions WHERE id = ?', [session.id]);
    return res.status(200).json({ success: true, session: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * 食客吃饱评价
 * POST /api/kitchen/praise
 */
router.post('/praise', authMiddleware, async (req, res, next) => {
  const { praise } = req.body;
  const user = req.user;

  try {
    const db = getDB();
    // 必须是当前用户为食客 (diner_id) 且状态为 'served' 的会话
    const session = await db.get(
      `SELECT * FROM kitchen_sessions 
       WHERE diner_id = ? AND status = 'served' 
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'NotFoundError', message: '没有等待您评价的已上桌餐点。' });
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE kitchen_sessions SET status = 'eaten', praise = ?, updated_at = ? WHERE id = ?`,
      [praise || '味道极赞！宝贝辛苦啦！❤️', now, session.id]
    );

    const updated = await db.get('SELECT * FROM kitchen_sessions WHERE id = ?', [session.id]);
    return res.status(200).json({ success: true, session: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * 重置会话 (归档当前会话，开启下一顿)
 * POST /api/kitchen/reset
 */
router.post('/reset', authMiddleware, async (req, res, next) => {
  const user = req.user;

  try {
    const db = getDB();
    // 归档两个人之间最新的一条且状态不是 'archived' 的厨房会话
    const session = await db.get(
      `SELECT * FROM kitchen_sessions 
       WHERE ((diner_id = ? AND chef_id = ?) OR (diner_id = ? AND chef_id = ?)) 
         AND status != 'archived' 
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, user.partner_id, user.partner_id, user.id]
    );

    if (session) {
      const now = new Date().toISOString();
      await db.run(
        `UPDATE kitchen_sessions SET status = 'archived', updated_at = ? WHERE id = ?`,
        [now, session.id]
      );
    }

    return res.status(200).json({ success: true, message: '会话已重置，大厨已空闲。' });
  } catch (error) {
    next(error);
  }
});

export default router;

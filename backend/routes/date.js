import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { sendSubscribeMessage } from '../services/wechat.js';
import { getShanghaiDatePrefix } from '../utils/date.js';

const router = express.Router();

/**
 * 获取当前用户及其伴侣的全部约会计划列表
 * GET /api/date
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const user = req.user;

    const plans = await db.all(
      `SELECT * FROM date_plans 
       WHERE created_by = ? OR partner_id = ? 
       ORDER BY meeting_time DESC`,
      [user.id, user.id]
    );

    return res.status(200).json({ plans });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取今天已确认的约会计划 (用于主页看板)
 * GET /api/date/today
 */
router.get('/today', authMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const user = req.user;
    const todayStr = getShanghaiDatePrefix();

    // 查询今天已同意(accepted)的约会计划
    // 匹配 meeting_time 格式为 YYYY-MM-DD% 的计划
    const plan = await db.get(
      `SELECT * FROM date_plans 
       WHERE status = 'accepted' 
         AND (created_by = ? OR partner_id = ?)
         AND meeting_time LIKE ?
       LIMIT 1`,
      [user.id, user.id, `${todayStr}%`]
    );

    return res.status(200).json({ plan: plan || null });
  } catch (error) {
    next(error);
  }
});

/**
 * 发起一个新的约会提案
 * POST /api/date
 */
router.post('/', authMiddleware, async (req, res, next) => {
  const { title, meetingTime, meetingLocation, notes } = req.body;
  const user = req.user;

  if (!user.partner_id) {
    return res.status(400).json({ error: 'ValidationError', message: '您必须先配对伴侣才能发起约会提案' });
  }

  if (!title || !title.trim() || !meetingTime) {
    return res.status(400).json({ error: 'ValidationError', message: '约会主题与见面时间不能为空' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT INTO date_plans (title, meeting_time, meeting_location, notes, status, created_by, partner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        title.trim(),
        meetingTime,
        meetingLocation || '',
        notes || '',
        user.id,
        user.partner_id,
        now,
        now
      ]
    );

    const newPlan = await db.get('SELECT * FROM date_plans WHERE id = ?', [result.lastID]);

    // 异步尝试给伴侣发送订阅消息通知
    const partner = await db.get('SELECT openid FROM users WHERE id = ?', [user.partner_id]);
    if (partner) {
      sendSubscribeMessage(
        partner.openid,
        'MOCK_TEMPLATE_PROPOSE_ID', // 微信公众平台模板ID
        'pages/date/date',
        {
          thing1: { value: '新的约会邀请' },
          thing2: { value: `${user.nickname} 发起了约会：${title.substring(0, 15)}` },
          time3: { value: meetingTime }
        }
      ).catch(e => console.error('[Notification Error] 发送提案通知异常:', e));
    }

    return res.status(201).json({ success: true, plan: newPlan });
  } catch (error) {
    next(error);
  }
});

/**
 * 接受约会提案
 * POST /api/date/:id/accept
 */
router.post('/:id/accept', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const user = req.user;

  try {
    const db = getDB();
    const now = new Date().toISOString();

    // 校验提案是否存在，且接收方是当前用户，且处于 pending 状态
    const plan = await db.get('SELECT * FROM date_plans WHERE id = ?', [id]);
    if (!plan) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该约会提案' });
    }

    if (plan.partner_id !== user.id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权处理该约会提案' });
    }

    if (plan.status !== 'pending' && plan.status !== 'revision_requested') {
      return res.status(400).json({ error: 'ValidationError', message: '提案状态不可流转，该提案已处理' });
    }

    await db.run(
      "UPDATE date_plans SET status = 'accepted', updated_at = ? WHERE id = ?",
      [now, id]
    );

    // 异步发送微信通知给发起者
    const creator = await db.get('SELECT openid FROM users WHERE id = ?', [plan.created_by]);
    if (creator) {
      sendSubscribeMessage(
        creator.openid,
        'MOCK_TEMPLATE_ACCEPT_ID',
        'pages/date/date',
        {
          thing1: { value: '约会提案已接受' },
          thing2: { value: `伴侣同意了约会提案：${plan.title.substring(0, 15)}` },
          time3: { value: plan.meeting_time }
        }
      ).catch(e => console.error('[Notification Error] 发送接受通知异常:', e));
    }

    return res.status(200).json({ success: true, message: '已接受约会提案' });
  } catch (error) {
    next(error);
  }
});

/**
 * 婉拒约会提案
 * POST /api/date/:id/reject
 */
router.post('/:id/reject', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const user = req.user;

  try {
    const db = getDB();
    const now = new Date().toISOString();

    const plan = await db.get('SELECT * FROM date_plans WHERE id = ?', [id]);
    if (!plan) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该约会提案' });
    }

    if (plan.partner_id !== user.id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权处理该约会提案' });
    }

    if (plan.status !== 'pending' && plan.status !== 'revision_requested') {
      return res.status(400).json({ error: 'ValidationError', message: '该提案已处理' });
    }

    await db.run(
      "UPDATE date_plans SET status = 'rejected', updated_at = ? WHERE id = ?",
      [now, id]
    );

    // 异步发送微信通知给发起者
    const creator = await db.get('SELECT openid FROM users WHERE id = ?', [plan.created_by]);
    if (creator) {
      sendSubscribeMessage(
        creator.openid,
        'MOCK_TEMPLATE_REJECT_ID',
        'pages/date/date',
        {
          thing1: { value: '约会提案已婉拒' },
          thing2: { value: `伴侣婉拒了约会提案：${plan.title.substring(0, 15)}` },
          time3: { value: plan.meeting_time }
        }
      ).catch(e => console.error('[Notification Error] 发送拒绝通知异常:', e));
    }

    return res.status(200).json({ success: true, message: '已婉拒约会提案' });
  } catch (error) {
    next(error);
  }
});

/**
 * 提出约会修改建议
 * POST /api/date/:id/revision
 */
router.post('/:id/revision', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const { revisionNote } = req.body;
  const user = req.user;

  if (!revisionNote || !revisionNote.trim()) {
    return res.status(400).json({ error: 'ValidationError', message: '修改建议说明不能为空' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    const plan = await db.get('SELECT * FROM date_plans WHERE id = ?', [id]);
    if (!plan) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该约会提案' });
    }

    if (plan.partner_id !== user.id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权修改该约会提案' });
    }

    if (plan.status !== 'pending') {
      return res.status(400).json({ error: 'ValidationError', message: '该提案当前不可提出修改意见' });
    }

    await db.run(
      "UPDATE date_plans SET status = 'revision_requested', revision_note = ?, updated_at = ? WHERE id = ?",
      [revisionNote.trim(), now, id]
    );

    // 异步发送微信通知给发起者
    const creator = await db.get('SELECT openid FROM users WHERE id = ?', [plan.created_by]);
    if (creator) {
      sendSubscribeMessage(
        creator.openid,
        'MOCK_TEMPLATE_REVISION_ID',
        'pages/date/date',
        {
          thing1: { value: '约会修改建议' },
          thing2: { value: `伴侣提出了修改意见：${revisionNote.substring(0, 15)}` },
          time3: { value: plan.meeting_time }
        }
      ).catch(e => console.error('[Notification Error] 发送修改意见通知异常:', e));
    }

    return res.status(200).json({ success: true, message: '修改建议发送成功' });
  } catch (error) {
    next(error);
  }
});

/**
 * 撤回/删除约会行程记录
 * DELETE /api/date/:id
 */
router.delete('/:id', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const user = req.user;

  try {
    const db = getDB();
    const plan = await db.get('SELECT * FROM date_plans WHERE id = ?', [id]);

    if (!plan) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该行程记录' });
    }

    // 只有发起人能在 pending/revision 时撤销；已处理的提案双方皆可删除以清理列表
    const isCreator = plan.created_by === user.id;
    const isReceiver = plan.partner_id === user.id;

    if (!isCreator && !isReceiver) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权删除该行程记录' });
    }

    if (plan.status === 'pending' && !isCreator) {
      return res.status(400).json({ error: 'ValidationError', message: '只有发起人才能在对方同意前撤销提案' });
    }

    await db.run('DELETE FROM date_plans WHERE id = ?', [id]);

    return res.status(200).json({ success: true, message: '行程记录删除/撤销成功' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
//           约会灵感池 (Wishlist) 路由
// ==========================================

/**
 * 获取共同的约会愿望单列表
 * GET /api/date/wishlist
 */
router.get('/wishlist', authMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const user = req.user;

    let query = 'SELECT * FROM date_wishlist WHERE created_by = ?';
    let params = [user.id];

    if (user.partner_id) {
      query += ' OR created_by = ?';
      params.push(user.partner_id);
    }

    query += ' ORDER BY created_at DESC';
    const wishlist = await db.all(query, params);

    return res.status(200).json({ wishlist });
  } catch (error) {
    next(error);
  }
});

/**
 * 添加一个愿望到清单
 * POST /api/date/wishlist
 */
router.post('/wishlist', authMiddleware, async (req, res, next) => {
  const { name } = req.body;
  const user = req.user;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'ValidationError', message: '愿望内容不能为空' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    const result = await db.run(
      'INSERT INTO date_wishlist (name, created_by, created_at) VALUES (?, ?, ?)',
      [name.trim(), user.id, now]
    );

    const newWish = await db.get('SELECT * FROM date_wishlist WHERE id = ?', [result.lastID]);
    return res.status(201).json({ success: true, wish: newWish });
  } catch (error) {
    next(error);
  }
});

/**
 * 从愿望单中删除
 * DELETE /api/date/wishlist/:id
 */
router.delete('/wishlist/:id', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const user = req.user;

  try {
    const db = getDB();
    const wish = await db.get('SELECT id, created_by FROM date_wishlist WHERE id = ?', [id]);

    if (!wish) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该约会愿望项目' });
    }

    // 允许自己和伴侣删除愿望
    if (wish.created_by !== user.id && wish.created_by !== user.partner_id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权删除此愿望项目' });
    }

    await db.run('DELETE FROM date_wishlist WHERE id = ?', [id]);

    return res.status(200).json({ success: true, message: '愿望项目已移除' });
  } catch (error) {
    next(error);
  }
});

export default router;

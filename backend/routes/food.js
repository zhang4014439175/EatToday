import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { getShanghaiDayUtcRange } from '../utils/date.js';

const router = express.Router();

function getAccessibleFoodCondition(user) {
  if (user.partner_id) {
    return {
      where: '(created_by = ? OR created_by = ?)',
      params: [user.id, user.partner_id]
    };
  }

  return {
    where: 'created_by = ?',
    params: [user.id]
  };
}

/**
 * 获取共同美食库
 * GET /api/food
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const user = req.user;

    let query = 'SELECT * FROM food_pool WHERE created_by = ?';
    let params = [user.id];

    if (user.partner_id) {
      query += ' OR created_by = ?';
      params.push(user.partner_id);
    }

    query += ' ORDER BY created_at DESC';
    const foods = await db.all(query, params);

    return res.status(200).json({ foods });
  } catch (error) {
    next(error);
  }
});

/**
 * 添加美食到共享候选池
 * POST /api/food
 */
router.post('/', authMiddleware, async (req, res, next) => {
  const { name, tags, category, image_url } = req.body;
  const user = req.user;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'ValidationError', message: '美食名称不能为空' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    const result = await db.run(
      'INSERT INTO food_pool (name, tags, category, image_url, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), tags || '', category || 'home', image_url || '', user.id, now, now]
    );

    const newFood = await db.get('SELECT * FROM food_pool WHERE id = ?', [result.lastID]);
    return res.status(201).json({ success: true, food: newFood });
  } catch (error) {
    next(error);
  }
});

/**
 * 修改美食属性 (包括菜名、标签、分类、图片等)
 * PUT /api/food/:id
 */
router.put('/:id', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const { name, tags, category, image_url } = req.body;
  const user = req.user;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'ValidationError', message: '美食名称不能为空' });
  }

  try {
    const db = getDB();
    // 检查是否存在
    const food = await db.get('SELECT id, created_by FROM food_pool WHERE id = ?', [id]);
    if (!food) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该美食项目' });
    }

    // 只能修改自己或伴侣创建的
    if (food.created_by !== user.id && food.created_by !== user.partner_id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权修改此美食项目' });
    }

    const now = new Date().toISOString();
    await db.run(
      'UPDATE food_pool SET name = ?, tags = ?, category = ?, image_url = ?, updated_at = ? WHERE id = ?',
      [name.trim(), tags || '', category || 'home', image_url || '', now, id]
    );

    const updatedFood = await db.get('SELECT * FROM food_pool WHERE id = ?', [id]);
    return res.status(200).json({ success: true, food: updatedFood });
  } catch (error) {
    next(error);
  }
});

/**
 * 删除美食 (情侣双方均可删除)
 * DELETE /api/food/:id
 */
router.delete('/:id', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const user = req.user;

  try {
    const db = getDB();
    // 检查是否存在
    const food = await db.get('SELECT id, created_by FROM food_pool WHERE id = ?', [id]);
    if (!food) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该美食项目' });
    }

    // 只能删除自己或伴侣创建的
    if (food.created_by !== user.id && food.created_by !== user.partner_id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权删除此美食项目' });
    }

    await db.run('DELETE FROM food_pool WHERE id = ?', [id]);

    return res.status(200).json({ success: true, message: '删除成功' });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取今天锁定的最终菜品 (用于主页看板)
 * GET /api/food/today
 */
router.get('/today', authMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const user = req.user;
    const { start, end } = getShanghaiDayUtcRange();
    
    // SQLite 查询今天已锁定的投票会话或轮盘结果
    // 匹配 created_at 格式为 YYYY-MM-DD% 的锁死会话
    const session = await db.get(
      `SELECT fs.*, fp.name as food_name 
       FROM food_sessions fs
       JOIN food_pool fp ON fs.selected_food_id = fp.id
       WHERE fs.status = 'locked' 
         AND (fs.created_by = ? OR fs.partner_id = ?)
         AND fs.created_at >= ?
         AND fs.created_at < ?
       ORDER BY fs.updated_at DESC
       LIMIT 1`,
      [user.id, user.id, start, end]
    );

    if (session) {
      return res.status(200).json({
        food: {
          id: session.selected_food_id,
          name: session.food_name,
          reason: session.result_reason
        }
      });
    }

    return res.status(200).json({ food: null });
  } catch (error) {
    next(error);
  }
});

/**
 * 锁定大转盘抽签结果为今日午餐/晚餐
 * POST /api/food/lock-wheel
 */
router.post('/lock-wheel', authMiddleware, async (req, res, next) => {
  const { foodId } = req.body;
  const user = req.user;

  if (!foodId) {
    return res.status(400).json({ error: 'ValidationError', message: '请传入要锁定的食物 ID' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();
    const { start, end } = getShanghaiDayUtcRange();

    // 检查食物是否在自己或伴侣的池子中
    const accessibleFood = getAccessibleFoodCondition(user);
    const food = await db.get(
      `SELECT id FROM food_pool WHERE id = ? AND ${accessibleFood.where}`,
      [foodId, ...accessibleFood.params]
    );
    if (!food) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该美食或您无权锁定它' });
    }

    // 检测今天是否已经锁定过
    const existing = await db.get(
      `SELECT id FROM food_sessions 
       WHERE status = 'locked' 
         AND (created_by = ? OR partner_id = ?) 
         AND created_at >= ?
         AND created_at < ?`,
      [user.id, user.id, start, end]
    );

    if (existing) {
      // 如果已存在今日锁定，执行更新
      await db.run(
        `UPDATE food_sessions 
         SET selected_food_id = ?, result_reason = 'random', updated_at = ? 
         WHERE id = ?`,
        [foodId, now, existing.id]
      );
    } else {
      // 否则插入一条锁定记录
      await db.run(
        `INSERT INTO food_sessions (created_by, partner_id, status, selected_food_id, result_reason, created_at, updated_at)
         VALUES (?, ?, 'locked', ?, 'random', ?, ?)`,
        [user.id, user.partner_id || null, foodId, now, now]
      );
    }

    return res.status(200).json({ success: true, message: '已锁定今日美食' });
  } catch (error) {
    next(error);
  }
});

/**
 * 发起/创建今日选菜投票会话
 * POST /api/food/session
 */
router.post('/session', authMiddleware, async (req, res, next) => {
  const user = req.user;

  if (!user.partner_id) {
    return res.status(400).json({ error: 'ValidationError', message: '您必须先配对伴侣才能开启投票会话' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();
    const { start, end } = getShanghaiDayUtcRange();

    // 检查今天是否已有活跃的投票会话
    const existing = await db.get(
      `SELECT * FROM food_sessions 
         WHERE (created_by = ? OR partner_id = ?) 
         AND created_at >= ?
         AND created_at < ?`,
      [user.id, user.id, start, end]
    );

    if (existing) {
      // 如果已有投票，若其处于 locked 状态，支持重新发起（删除旧的或更新状态为 voting）
      if (existing.status === 'locked') {
        // 清理旧投票关联记录并重置会话
        await db.run('DELETE FROM food_votes WHERE session_id = ?', [existing.id]);
        await db.run(
          `UPDATE food_sessions 
           SET status = 'voting', selected_food_id = NULL, result_reason = NULL, updated_at = ? 
           WHERE id = ?`,
          [now, existing.id]
        );
        const resetSession = await db.get('SELECT * FROM food_sessions WHERE id = ?', [existing.id]);
        return res.status(200).json({ session: resetSession });
      }
      return res.status(200).json({ session: existing });
    }

    // 创建新的投票会话
    const result = await db.run(
      `INSERT INTO food_sessions (created_by, partner_id, status, created_at, updated_at)
       VALUES (?, ?, 'voting', ?, ?)`,
      [user.id, user.partner_id, now, now]
    );

    const session = await db.get('SELECT * FROM food_sessions WHERE id = ?', [result.lastID]);
    return res.status(201).json({ session });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取今日活跃的投票会话与当前投票详情
 * GET /api/food/session/active
 */
router.get('/session/active', authMiddleware, async (req, res, next) => {
  const user = req.user;

  try {
    const db = getDB();
    const { start, end } = getShanghaiDayUtcRange();

    const session = await db.get(
      `SELECT fs.*, fp.name as selected_food_name
       FROM food_sessions fs
       LEFT JOIN food_pool fp ON fs.selected_food_id = fp.id
       WHERE (fs.created_by = ? OR fs.partner_id = ?) 
         AND fs.created_at >= ?
         AND fs.created_at < ?
       ORDER BY fs.updated_at DESC
       LIMIT 1`,
      [user.id, user.id, start, end]
    );

    if (!session) {
      return res.status(200).json({ session: null, votes: [] });
    }

    // 获取该会话下的所有投票详情
    const votes = await db.all(
      'SELECT id, session_id, user_id, food_id, created_at FROM food_votes WHERE session_id = ?',
      [session.id]
    );

    return res.status(200).json({ session, votes });
  } catch (error) {
    next(error);
  }
});

/**
 * 为当前活跃选菜会话提交我的投票
 * POST /api/food/session/:id/vote
 */
router.post('/session/:id/vote', authMiddleware, async (req, res, next) => {
  const sessionId = req.params.id;
  const { foodIds } = req.body; // [12, 15, 17]
  const user = req.user;

  if (!Array.isArray(foodIds) || foodIds.length === 0 || foodIds.length > 3) {
    return res.status(400).json({ error: 'ValidationError', message: '投票数量必须在 1 ~ 3 个之间' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    // 1. 验证会话存在且在投票中
    const session = await db.get('SELECT * FROM food_sessions WHERE id = ?', [sessionId]);
    if (!session) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该投票会话' });
    }

    if (session.status !== 'voting') {
      return res.status(400).json({ error: 'ValidationError', message: '该选菜会话投票已结束' });
    }

    if (session.created_by !== user.id && session.partner_id !== user.id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权参与该投票会话' });
    }

    const uniqueFoodIds = [...new Set(foodIds.map(id => Number(id)))].filter(Number.isInteger);
    if (uniqueFoodIds.length !== foodIds.length) {
      return res.status(400).json({ error: 'ValidationError', message: '投票菜品不能重复，且必须是有效 ID' });
    }

    const accessibleFood = getAccessibleFoodCondition(user);
    const placeholders = uniqueFoodIds.map(() => '?').join(',');
    const validFoods = await db.all(
      `SELECT id FROM food_pool WHERE id IN (${placeholders}) AND ${accessibleFood.where}`,
      [...uniqueFoodIds, ...accessibleFood.params]
    );
    if (validFoods.length !== uniqueFoodIds.length) {
      return res.status(400).json({ error: 'ValidationError', message: '投票中包含不存在或无权选择的菜品' });
    }

    // 2. 验证用户是否已经投过票
    const alreadyVoted = await db.get(
      'SELECT id FROM food_votes WHERE session_id = ? AND user_id = ? LIMIT 1',
      [sessionId, user.id]
    );
    if (alreadyVoted) {
      return res.status(400).json({ error: 'ValidationError', message: '您已经为该会话提交过投票，无法更改' });
    }

    // 3. 开始事务保存投票，并检测结果
    await db.run('BEGIN TRANSACTION;');
    try {
      for (const foodId of uniqueFoodIds) {
        await db.run(
          `INSERT OR IGNORE INTO food_votes (session_id, user_id, food_id, created_at)
           VALUES (?, ?, ?, ?)`,
          [sessionId, user.id, foodId, now]
        );
      }

      // 获取所有投票者
      const voters = await db.all(
        'SELECT DISTINCT user_id FROM food_votes WHERE session_id = ?',
        [sessionId]
      );

      // 如果两个人都投票了，触发心有灵犀双人匹配算法！
      if (voters.length === 2) {
        // 用户 1 投的食物
        const votes1 = await db.all('SELECT food_id FROM food_votes WHERE session_id = ? AND user_id = ?', [sessionId, session.created_by]);
        const ids1 = votes1.map(v => v.food_id);

        // 用户 2 投的食物
        const votes2 = await db.all('SELECT food_id FROM food_votes WHERE session_id = ? AND user_id = ?', [sessionId, session.partner_id]);
        const ids2 = votes2.map(v => v.food_id);

        // 1. 求交集
        const intersection = ids1.filter(id => ids2.includes(id));
        let chosenFoodId = null;
        let reason = '';

        if (intersection.length > 0) {
          // 有交集：心有灵犀！在重合的食物中随机选一个
          chosenFoodId = intersection[Math.floor(Math.random() * intersection.length)];
          reason = 'intersection';
        } else {
          // 无交集：并集，在两边所有投的食物中随机选一个
          const union = [...new Set([...ids1, ...ids2])];
          chosenFoodId = union[Math.floor(Math.random() * union.length)];
          reason = 'random';
        }

        // 更新会话锁定结果
        await db.run(
          `UPDATE food_sessions 
           SET status = 'locked', selected_food_id = ?, result_reason = ?, updated_at = ? 
           WHERE id = ?`,
          [chosenFoodId, reason, now, sessionId]
        );
      }

      await db.run('COMMIT;');
    } catch (txErr) {
      await db.run('ROLLBACK;');
      throw txErr;
    }

    const updatedSession = await db.get('SELECT * FROM food_sessions WHERE id = ?', [sessionId]);
    return res.status(200).json({ success: true, session: updatedSession });
  } catch (error) {
    next(error);
  }
});

export default router;

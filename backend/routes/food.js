import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { getShanghaiDayUtcRange } from '../utils/date.js';

const router = express.Router();

function getAccessibleFoodCondition(user) {
  return {
    where: 'space_id = ?',
    params: [user.current_space_id]
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
 
    if (!user.current_space_id) {
      return res.status(200).json({ foods: [] });
    }
 
    const foods = await db.all(
      'SELECT * FROM food_pool WHERE space_id = ? ORDER BY created_at DESC',
      [user.current_space_id]
    );
 
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
 
  if (!user.current_space_id) {
    return res.status(400).json({ error: 'ValidationError', message: '用户未关联活跃空间，无法添加美食' });
  }
 
  try {
    const db = getDB();
    const now = new Date().toISOString();
 
    const result = await db.run(
      'INSERT INTO food_pool (name, tags, category, image_url, created_by, space_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), tags || '', category || 'home', image_url || '', user.id, user.current_space_id, now, now]
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
    const food = await db.get('SELECT id, created_by, space_id FROM food_pool WHERE id = ?', [id]);
    if (!food) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该美食项目' });
    }
 
    // 同一空间内的成员均可修改
    if (food.space_id !== user.current_space_id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权修改此空间的美食项目' });
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
 * 删除美食 (同一空间成员均可删除)
 * DELETE /api/food/:id
 */
router.delete('/:id', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const user = req.user;
 
  try {
    const db = getDB();
    // 检查是否存在
    const food = await db.get('SELECT id, created_by, space_id FROM food_pool WHERE id = ?', [id]);
    if (!food) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该美食项目' });
    }
 
    // 同一空间内的成员均可删除
    if (food.space_id !== user.current_space_id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权删除此空间的美食项目' });
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
 
    // 获取用户所属的所有物理空间 IDs
    const memberSpaces = await db.all('SELECT space_id FROM space_members WHERE user_id = ?', [user.id]);
    const spaceIds = memberSpaces.map(s => s.space_id);

    if (spaceIds.length === 0) {
      return res.status(200).json({ food: null });
    }

    const placeholders = spaceIds.map(() => '?').join(',');
    
    // SQLite 查询这些空间中今天已锁定的投票会话或轮盘结果
    const sessions = await db.all(
      `SELECT fs.*, fp.name as food_name, s.name as space_name 
       FROM food_sessions fs
       JOIN spaces s ON fs.space_id = s.id
       JOIN food_pool fp ON fs.selected_food_id = fp.id
       WHERE fs.status = 'locked' 
         AND fs.space_id IN (${placeholders})
         AND fs.created_at >= ?
         AND fs.created_at < ?
       ORDER BY fs.updated_at DESC`,
      [...spaceIds, start, end]
    );
 
    if (sessions.length > 0) {
      const showSpaceTag = spaceIds.length > 1;
      const combinedName = sessions
        .map(s => showSpaceTag ? `${s.space_name}: ${s.food_name}` : s.food_name)
        .join(' | ');

      return res.status(200).json({
        food: {
          id: sessions[0].selected_food_id,
          name: combinedName,
          reason: sessions.map(s => s.result_reason).filter(Boolean).join('; ') || '今天的美食选择'
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
         AND space_id = ? 
         AND created_at >= ?
         AND created_at < ?`,
      [user.current_space_id, start, end]
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
        `INSERT INTO food_sessions (space_id, created_by, status, selected_food_id, result_reason, created_at, updated_at)
         VALUES (?, ?, 'locked', ?, 'random', ?, ?)`,
        [user.current_space_id, user.id, foodId, now, now]
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

  if (!user.current_space_id) {
    return res.status(400).json({ error: 'ValidationError', message: '您必须先关联空间才能开启投票会话' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();
    const { start, end } = getShanghaiDayUtcRange();

    // 检查今天是否已有活跃的投票会话
    const existing = await db.get(
      `SELECT * FROM food_sessions 
         WHERE space_id = ? 
         AND created_at >= ?
         AND created_at < ?`,
      [user.current_space_id, start, end]
    );

    if (existing) {
      // 如果已有投票，若其处于 locked 状态，支持重新发起
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
      `INSERT INTO food_sessions (space_id, created_by, status, created_at, updated_at)
       VALUES (?, ?, 'voting', ?, ?)`,
      [user.current_space_id, user.id, now, now]
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

    if (!user.current_space_id) {
      return res.status(200).json({ session: null, votes: [] });
    }

    const session = await db.get(
      `SELECT fs.*, fp.name as selected_food_name
       FROM food_sessions fs
       LEFT JOIN food_pool fp ON fs.selected_food_id = fp.id
       WHERE fs.space_id = ?
         AND fs.created_at >= ?
         AND fs.created_at < ?
       ORDER BY fs.updated_at DESC
       LIMIT 1`,
      [user.current_space_id, start, end]
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
  const { foodIds } = req.body;
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

    // 校验空间一致性
    if (session.space_id !== user.current_space_id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权参与此空间下的投票会话' });
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

      // 获取当前活跃空间的成员总数
      const memberCountRow = await db.get(
        'SELECT COUNT(*) as count FROM space_members WHERE space_id = ?',
        [session.space_id]
      );
      const activeMembersCount = memberCountRow.count;

      // 获取所有已在会话下投过票的人
      const voters = await db.all(
        'SELECT DISTINCT user_id FROM food_votes WHERE session_id = ?',
        [sessionId]
      );

      // 如果空间里的所有人都投完票了，触发聚合选菜算法！
      if (voters.length >= activeMembersCount) {
        // 统计每个人投出的菜品票数
        const voteCounts = await db.all(
          `SELECT food_id, COUNT(*) as count 
           FROM food_votes 
           WHERE session_id = ? 
           GROUP BY food_id 
           ORDER BY count DESC`,
          [sessionId]
        );

        if (voteCounts.length > 0) {
          const maxCount = voteCounts[0].count;
          // 找出所有获得最高票数的菜品（可能有平局）
          const candidateFoods = voteCounts.filter(v => v.count === maxCount).map(v => v.food_id);

          // 随机从最高票数的菜品中抽取一个作为获胜者
          const chosenFoodId = candidateFoods[Math.floor(Math.random() * candidateFoods.length)];
          const reason = maxCount > 1 ? 'intersection' : 'random';

          // 更新会话锁定结果
          await db.run(
            `UPDATE food_sessions 
             SET status = 'locked', selected_food_id = ?, result_reason = ?, updated_at = ? 
             WHERE id = ?`,
            [chosenFoodId, reason, now, sessionId]
          );
        }
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

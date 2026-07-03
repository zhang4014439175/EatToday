import express from 'express';
import { getDB, seedDefaultFoods, seedDefaultWishlist } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * 产生唯一的6位空间邀请码
 */
async function generateUniqueSpaceCode(db) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  while (true) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const row = await db.get('SELECT id FROM spaces WHERE code = ?', [code]);
    if (!row) {
      return code;
    }
  }
}

/**
 * 创建新空间
 * POST /api/spaces/create
 */
router.post('/create', authMiddleware, async (req, res, next) => {
  const { name } = req.body;
  const userId = req.user.id;

  if (!name) {
    return res.status(400).json({ error: 'ValidationError', message: '缺少空间名称' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();
    const code = await generateUniqueSpaceCode(db);
    const type = 'group'; // 统一使用 group，支持最多5人，自己取名字来区分

    // 开启事务，确保空间和空间成员同步写入
    await db.run('BEGIN TRANSACTION');

    const spaceResult = await db.run(
      'INSERT INTO spaces (name, code, type, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
      [name, code, type, userId, now]
    );
    const spaceId = spaceResult.lastID;

    // 创建者设为管理员 admin
    await db.run(
      'INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [spaceId, userId, 'admin', now]
    );

    // 预置常见美食至该新空间
    await seedDefaultFoods(db, spaceId, userId);
    // 预置想去的地方清单至该新空间
    await seedDefaultWishlist(db, spaceId, userId);

    // 更新用户的当前活跃空间为刚新建的空间
    await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [spaceId, userId]);

    await db.run('COMMIT');

    const space = await db.get('SELECT * FROM spaces WHERE id = ?', [spaceId]);
    res.status(201).json({
      message: '空间创建成功',
      space
    });
  } catch (error) {
    const db = getDB();
    try { await db.run('ROLLBACK'); } catch (_) {}
    next(error);
  }
});

/**
 * 加入空间（通过6位邀请码）
 * POST /api/spaces/join
 */
router.post('/join', authMiddleware, async (req, res, next) => {
  const { code } = req.body;
  const userId = req.user.id;

  if (!code) {
    return res.status(400).json({ error: 'ValidationError', message: '请输入6位空间邀请码' });
  }

  try {
    const db = getDB();
    const space = await db.get('SELECT * FROM spaces WHERE code = ?', [code.toUpperCase()]);

    if (!space) {
      return res.status(404).json({ error: 'NotFound', message: '找不到对应的空间，请检查邀请码是否输入正确' });
    }

    if (space.type === 'solo') {
      return res.status(400).json({ error: 'Forbidden', message: '个人空间不支持加入成员' });
    }

    // 检查是否已经是该空间的成员
    const membership = await db.get(
      'SELECT id FROM space_members WHERE space_id = ? AND user_id = ?',
      [space.id, userId]
    );

    if (membership) {
      // 已经是成员了，直接将其活跃空间切换过去即可
      await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [space.id, userId]);
      return res.json({
        message: '您已经是该空间成员，已为您切换至该空间',
        space
      });
    }

    // 校验人数上限
    const memberCountRow = await db.get(
      'SELECT COUNT(*) as count FROM space_members WHERE space_id = ?',
      [space.id]
    );
    const count = memberCountRow.count;

    if (count >= 2) {
      return res.status(400).json({ error: 'LimitExceeded', message: '该空间已满员（限 2 人）' });
    }

    const now = new Date().toISOString();
    
    await db.run('BEGIN TRANSACTION');

    // 添加到空间成员
    await db.run(
      'INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [space.id, userId, 'member', now]
    );

    // 切换用户的当前活跃空间
    await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [space.id, userId]);

    await db.run('COMMIT');

    res.json({
      message: '成功加入空间',
      space
    });
  } catch (error) {
    const db = getDB();
    try { await db.run('ROLLBACK'); } catch (_) {}
    next(error);
  }
});

/**
 * 切换当前活跃空间
 * POST /api/spaces/switch
 */
router.post('/switch', authMiddleware, async (req, res, next) => {
  const { spaceId } = req.body;
  const userId = req.user.id;

  if (!spaceId) {
    return res.status(400).json({ error: 'ValidationError', message: '缺少目标空间 ID' });
  }

  try {
    const db = getDB();
    const membership = await db.get(
      'SELECT id FROM space_members WHERE space_id = ? AND user_id = ?',
      [spaceId, userId]
    );

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden', message: '您不是该空间的成员，无法切换' });
    }

    await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [spaceId, userId]);
    
    const space = await db.get('SELECT * FROM spaces WHERE id = ?', [spaceId]);
    res.json({
      message: '空间切换成功',
      space
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取我加入的所有空间列表
 * GET /api/spaces/my
 */
router.get('/my', authMiddleware, async (req, res, next) => {
  const userId = req.user.id;

  try {
    const db = getDB();
    const spaces = await db.all(
      `SELECT s.*, sm.role, 
       (SELECT COUNT(*) FROM space_members WHERE space_id = s.id) as member_count 
       FROM spaces s 
       JOIN space_members sm ON s.id = sm.space_id 
       WHERE sm.user_id = ?`,
      [userId]
    );

    res.json({ spaces });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取当前活跃空间的信息及全部成员列表
 * GET /api/spaces/current
 */
router.get('/current', authMiddleware, async (req, res, next) => {
  const user = req.user;
  
  if (!user.current_space_id) {
    return res.status(404).json({ error: 'NotFound', message: '当前用户未关联到任何活跃空间' });
  }

  try {
    const db = getDB();
    const space = await db.get('SELECT * FROM spaces WHERE id = ?', [user.current_space_id]);

    if (!space) {
      return res.status(404).json({ error: 'NotFound', message: '当前空间不存在' });
    }

    // 查询成员列表
    const members = await db.all(
      `SELECT u.id, u.nickname, u.avatar_url, sm.role, sm.joined_at 
       FROM users u 
       JOIN space_members sm ON u.id = sm.user_id 
       WHERE sm.space_id = ?`,
      [user.current_space_id]
    );

    res.json({
      space,
      members
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 退出当前空间
 * POST /api/spaces/leave
 */
router.post('/leave', authMiddleware, async (req, res, next) => {
  const { spaceId } = req.body;
  const userId = req.user.id;

  if (!spaceId) {
    return res.status(400).json({ error: 'ValidationError', message: '缺少要退出的空间 ID' });
  }

  try {
    const db = getDB();
    
    // 检查是否为该空间的成员
    const membership = await db.get(
      'SELECT id, role FROM space_members WHERE space_id = ? AND user_id = ?',
      [spaceId, userId]
    );

    if (!membership) {
      return res.status(400).json({ error: 'ValidationError', message: '您不属于该空间' });
    }

    const space = await db.get('SELECT * FROM spaces WHERE id = ?', [spaceId]);
    if (space && space.type === 'solo') {
      return res.status(400).json({ error: 'Forbidden', message: '不能退出个人空间' });
    }

    await db.run('BEGIN TRANSACTION');

    // 删除成员关系
    await db.run('DELETE FROM space_members WHERE space_id = ? AND user_id = ?', [spaceId, userId]);

    // 检查空间是否还有成员
    const membersCountRow = await db.get(
      'SELECT COUNT(*) as count FROM space_members WHERE space_id = ?',
      [spaceId]
    );
    
    if (membersCountRow.count === 0) {
      // 成员为空，销毁该空间及其所有附属业务数据
      await db.run('DELETE FROM anniversaries WHERE space_id = ?', [spaceId]);
      await db.run('DELETE FROM food_pool WHERE space_id = ?', [spaceId]);
      await db.run('DELETE FROM food_sessions WHERE space_id = ?', [spaceId]);
      await db.run('DELETE FROM date_plans WHERE space_id = ?', [spaceId]);
      await db.run('DELETE FROM kitchen_sessions WHERE space_id = ?', [spaceId]);
      await db.run('DELETE FROM calendar_custom_events WHERE space_id = ?', [spaceId]);
      await db.run('DELETE FROM spaces WHERE id = ?', [spaceId]);
      console.log(`Space ${spaceId} is empty, fully cleaned up and deleted.`);
    }

    // 检查并重置当前用户的活跃空间（如果他刚才退出的是他当前的活跃空间）
    const freshUser = await db.get('SELECT current_space_id FROM users WHERE id = ?', [userId]);
    if (freshUser.current_space_id === Number(spaceId)) {
      // 寻找该用户加入的其它空间，如果无其它空间，则退回到他的默认 solo 空间
      let fallbackSpace = await db.get(
        `SELECT space_id FROM space_members sm 
         JOIN spaces s ON sm.space_id = s.id 
         WHERE sm.user_id = ? AND s.type = 'solo' LIMIT 1`,
        [userId]
      );

      if (!fallbackSpace) {
        // 万一没有，创建一个默认 solo 空间
        const now = new Date().toISOString();
        const code = await generateUniqueSpaceCode(db);
        const name = '我的个人空间';
        
        const soloResult = await db.run(
          'INSERT INTO spaces (name, code, type, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
          [name, code, 'solo', userId, now]
        );
        const newSoloId = soloResult.lastID;
        
        await db.run(
          'INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
          [newSoloId, userId, 'admin', now]
        );
        // 预置常见美食至该 fallback 空间
        await seedDefaultFoods(db, newSoloId, userId);
        // 预置想去的地方清单至该 fallback 空间
        await seedDefaultWishlist(db, newSoloId, userId);
        fallbackSpace = { space_id: newSoloId };
      }

      await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [fallbackSpace.space_id, userId]);
    }

    await db.run('COMMIT');

    res.json({ message: '成功退出该空间' });
  } catch (error) {
    const db = getDB();
    try { await db.run('ROLLBACK'); } catch (_) {}
    next(error);
  }
});

/**
 * 接受好友的邀请，创建双人空间并将其设置为两人的默认空间
 * POST /api/spaces/accept-invite
 */
router.post('/accept-invite', authMiddleware, async (req, res, next) => {
  const { senderId } = req.body;
  const inviteeId = req.user.id;

  if (!senderId) {
    return res.status(400).json({ error: 'ValidationError', message: '缺少邀请人 ID' });
  }

  if (Number(senderId) === Number(inviteeId)) {
    return res.status(400).json({ error: 'ValidationError', message: '不能与自己建立双人空间' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    // 1. 查询邀请人
    const sender = await db.get('SELECT id, nickname FROM users WHERE id = ?', [senderId]);
    if (!sender) {
      return res.status(404).json({ error: 'NotFound', message: '找不到邀请人' });
    }

    const invitee = req.user;

    // 2. 检查两者是否已经在一个双人空间里
    const commonSpace = await db.get(
      `SELECT sm1.space_id 
       FROM space_members sm1
       JOIN space_members sm2 ON sm1.space_id = sm2.space_id
       JOIN spaces s ON s.id = sm1.space_id
       WHERE sm1.user_id = ? AND sm2.user_id = ? AND s.type = 'group'`,
      [senderId, inviteeId]
    );

    if (commonSpace) {
      // 已经存在共同空间，直接将其都切换为默认活跃空间即可
      await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [commonSpace.space_id, senderId]);
      await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [commonSpace.space_id, inviteeId]);
      
      return res.status(200).json({
        success: true,
        message: '你们已经是共同空间成员，已自动设置为默认空间',
        spaceId: commonSpace.space_id
      });
    }

    // 3. 创建新的双人空间 (type: 'group'，最大限制2人)
    const code = await generateUniqueSpaceCode(db);
    const spaceName = `${sender.nickname || '用户'} & ${invitee.nickname || '用户'} 的双人空间`;

    await db.run('BEGIN TRANSACTION');

    const spaceResult = await db.run(
      'INSERT INTO spaces (name, code, type, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
      [spaceName, code, 'group', senderId, now]
    );
    const spaceId = spaceResult.lastID;

    // 4. 将两人作为成员加入此空间
    await db.run(
      'INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [spaceId, senderId, 'admin', now]
    );
    await db.run(
      'INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [spaceId, inviteeId, 'member', now]
    );

    // 预置默认菜品和玩乐
    await seedDefaultFoods(db, spaceId, senderId);
    await seedDefaultWishlist(db, spaceId, senderId);

    // 5. 设置为两人的 current_space_id
    await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [spaceId, senderId]);
    await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [spaceId, inviteeId]);

    await db.run('COMMIT');

    return res.status(201).json({
      success: true,
      message: '双人空间创建成功！',
      spaceId
    });
  } catch (error) {
    const db = getDB();
    try { await db.run('ROLLBACK'); } catch (_) {}
    next(error);
  }
});

export default router;

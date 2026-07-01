import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * 计算纪念日距离今天还有多少天
 * @param {string} dateStr 格式 'YYYY-MM-DD'
 * @param {number} isYearly 0单次，1每年重复
 * @returns {number} 剩余天数。单次过期返回 -1
 */
function calculateDaysLeft(dateStr, isYearly) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 解析纪念日
  const annDate = new Date(dateStr);
  if (isNaN(annDate.getTime())) return -1;
  annDate.setHours(0, 0, 0, 0);

  if (!isYearly) {
    // 单次纪念日
    const diffTime = annDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : -1;
  } else {
    // 每年重复纪念日
    const currentYear = today.getFullYear();
    const targetAnnDate = new Date(annDate);
    targetAnnDate.setFullYear(currentYear);

    // 如果今年的纪念日已经过去，则计算明年的
    if (targetAnnDate < today) {
      targetAnnDate.setFullYear(currentYear + 1);
    }

    const diffTime = targetAnnDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

/**
 * 获取当前用户及其情侣伴侣的所有纪念日列表
 * GET /api/anniversary
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const user = req.user;
    
    if (!user.current_space_id) {
      return res.status(200).json({ anniversaries: [] });
    }

    const anniversaries = await db.all(
      'SELECT * FROM anniversaries WHERE space_id = ? ORDER BY date DESC',
      [user.current_space_id]
    );

    return res.status(200).json({ anniversaries });
  } catch (error) {
    next(error);
  }
});

/**
 * 计算获取最近将到来的纪念日
 * GET /api/anniversary/nearest
 */
router.get('/nearest', authMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const user = req.user;
 
    // 获取用户所属的所有物理空间 IDs
    const memberSpaces = await db.all('SELECT space_id FROM space_members WHERE user_id = ?', [user.id]);
    const spaceIds = memberSpaces.map(s => s.space_id);

    if (spaceIds.length === 0) {
      return res.status(200).json({ anniversary: null });
    }

    const placeholders = spaceIds.map(() => '?').join(',');

    const list = await db.all(
      `SELECT a.*, s.name as space_name FROM anniversaries a
       JOIN spaces s ON a.space_id = s.id
       WHERE a.space_id IN (${placeholders})`,
      spaceIds
    );
    
    if (list.length === 0) {
      return res.status(200).json({ anniversary: null });
    }
 
    const showSpaceTag = spaceIds.length > 1;

    // 计算每个纪念日距离今天的天数，排除已经过期的单次纪念日
    const upcomingList = list
      .map(ann => {
        const daysLeft = calculateDaysLeft(ann.date, ann.is_yearly);
        const displayTitle = showSpaceTag ? `[${ann.space_name}] ${ann.title}` : ann.title;
        return { ...ann, title: displayTitle, daysLeft };
      })
      .filter(ann => ann.daysLeft >= 0) // 过滤掉过期的单次
      .sort((a, b) => a.daysLeft - b.daysLeft); // 按剩余天数升序
 
    return res.status(200).json({
      anniversary: upcomingList.length > 0 ? upcomingList[0] : null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 新增纪念日
 * POST /api/anniversary
 */
router.post('/', authMiddleware, async (req, res, next) => {
  const { title, date, dateType, isYearly } = req.body;
  const user = req.user;

  if (!title || !title.trim() || !date) {
    return res.status(400).json({ error: 'ValidationError', message: '纪念日主题与日期不能为空' });
  }

  if (!user.current_space_id) {
    return res.status(400).json({ error: 'ValidationError', message: '用户未关联活跃空间，无法创建纪念日' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT INTO anniversaries (title, date, date_type, is_yearly, created_by, space_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        date,
        dateType !== undefined ? Number(dateType) : 0, // 0为公历，1为农历
        isYearly !== undefined ? Number(isYearly) : 0,  // 0为单次，1为每年重复
        user.id,
        user.current_space_id,
        now,
        now
      ]
    );

    const newAnn = await db.get('SELECT * FROM anniversaries WHERE id = ?', [result.lastID]);
    return res.status(201).json({
      success: true,
      anniversary: newAnn
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 删除指定的纪念日 (必须是自己创建的才能删除)
 * DELETE /api/anniversary/:id
 */
router.delete('/:id', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const user = req.user;

  try {
    const db = getDB();
    const ann = await db.get('SELECT id, created_by, space_id FROM anniversaries WHERE id = ?', [id]);

    if (!ann) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该纪念日记录' });
    }

    if (ann.space_id !== user.current_space_id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '该纪念日不属于您当前的活跃空间，无权删除' });
    }

    await db.run('DELETE FROM anniversaries WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: '纪念日记录删除成功'
    });
  } catch (error) {
    next(error);
  }
});

export default router;

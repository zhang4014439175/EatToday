import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * 获取单月所有合并的日程/事件数据
 * GET /api/calendar/month
 */
router.get('/month', authMiddleware, async (req, res, next) => {
  const { year, month } = req.query;
  const user = req.user;

  if (!year || !month) {
    return res.status(400).json({ error: 'ValidationError', message: '年份和月份参数不能为空。' });
  }

  const monthStr = String(month).padStart(2, '0');
  const prefix = `${year}-${monthStr}-%`;

  try {
    const db = getDB();
    const eventsByDay = {};

    // 1. 获取用户所属的所有空间 IDs
    const memberSpaces = await db.all(
      `SELECT sm.space_id, s.name AS space_name FROM space_members sm
       JOIN spaces s ON sm.space_id = s.id
       WHERE sm.user_id = ?`,
      [user.id]
    );
    const spaceIds = memberSpaces.map(s => s.space_id);
    const showSpaceTag = spaceIds.length > 1;

    if (spaceIds.length === 0) {
      return res.status(200).json({ success: true, year: Number(year), month: Number(month), events: {} });
    }

    const placeholders = spaceIds.map(() => '?').join(',');

    const addEvent = (dateStr, event) => {
      if (!dateStr) return;
      const day = dateStr.substring(0, 10);
      if (!eventsByDay[day]) {
        eventsByDay[day] = [];
      }
      eventsByDay[day].push(event);
    };

    // 2. 获取纪念日 (Anniversaries)
    let annQuery = `
      SELECT a.*, s.name AS space_name FROM anniversaries a
      JOIN spaces s ON a.space_id = s.id
      WHERE a.space_id IN (${placeholders})
        AND (
          (a.is_yearly = 1 AND SUBSTR(a.date, 6, 2) = ?)
          OR (a.is_yearly = 0 AND a.date LIKE ?)
        )
    `;
    let annParams = [...spaceIds, monthStr, prefix];
    const anniversaries = await db.all(annQuery, annParams);

    anniversaries.forEach(item => {
      let targetDate = item.date;
      if (item.is_yearly === 1) {
        const md = item.date.substring(5, 10); // "MM-DD"
        targetDate = `${year}-${md}`;
      }
      const displayTitle = showSpaceTag ? `[${item.space_name}] ${item.title}` : item.title;
      addEvent(targetDate, {
        id: item.id,
        type: 'anniversary',
        title: displayTitle,
        time: null,
        is_yearly: item.is_yearly,
        original_date: item.date
      });
    });

    // 3. 获取约会计划 (Date Plans)
    let dateQuery = `
      SELECT dp.*, s.name AS space_name FROM date_plans dp
      JOIN spaces s ON dp.space_id = s.id
      WHERE dp.space_id IN (${placeholders})
        AND dp.meeting_time LIKE ?
        AND dp.status != 'rejected'
    `;
    const datePlans = await db.all(dateQuery, [...spaceIds, prefix]);

    datePlans.forEach(plan => {
      const timePart = plan.meeting_time.substring(11, 16);
      const displayTitle = showSpaceTag ? `[${plan.space_name}] ${plan.title}` : plan.title;
      addEvent(plan.meeting_time, {
        id: plan.id,
        type: 'date',
        title: displayTitle,
        time: timePart || null,
        location: plan.meeting_location,
        status: plan.status,
        notes: plan.notes
      });
    });

    // 4. 获取爱心厨房记录 (Kitchen Sessions)
    let kitchenQuery = `
      SELECT ks.*, s.name AS space_name FROM kitchen_sessions ks
      JOIN spaces s ON ks.space_id = s.id
      WHERE ks.space_id IN (${placeholders})
        AND ks.created_at LIKE ?
    `;
    const kitchenSessions = await db.all(kitchenQuery, [...spaceIds, prefix]);

    kitchenSessions.forEach(session => {
      const utcTime = new Date(session.created_at).getTime();
      if (isNaN(utcTime)) return;
      const bjDate = new Date(utcTime + 8 * 60 * 60 * 1000);
      const y = bjDate.getUTCFullYear();
      const m = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(bjDate.getUTCDate()).padStart(2, '0');
      const hh = String(bjDate.getUTCHours()).padStart(2, '0');
      const mm = String(bjDate.getUTCMinutes()).padStart(2, '0');
      const datePart = `${y}-${m}-${d}`;
      const timePart = `${hh}:${mm}`;

      const displayTitle = showSpaceTag ? `[${session.space_name}] ${session.dish_name}` : session.dish_name;
      addEvent(datePart, {
        id: session.id,
        type: 'kitchen',
        title: displayTitle,
        time: timePart,
        status: session.status,
        chef_id: session.chef_id,
        diner_id: session.diner_id,
        chef_note: session.chef_note,
        diner_note: session.diner_note,
        praise: session.praise,
        image_url: session.image_url
      });
    });

    // 5. 获取出去吃锁定记录 (Dine Out Locks)
    let foodQuery = `
      SELECT fs.*, fp.name AS food_name, s.name AS space_name FROM food_sessions fs
      JOIN spaces s ON fs.space_id = s.id
      LEFT JOIN food_pool fp ON fs.selected_food_id = fp.id
      WHERE fs.space_id IN (${placeholders})
        AND fs.status = 'locked'
        AND fs.created_at LIKE ?
    `;
    const foodSessions = await db.all(foodQuery, [...spaceIds, prefix]);

    foodSessions.forEach(session => {
      const utcTime = new Date(session.created_at).getTime();
      if (isNaN(utcTime)) return;
      const bjDate = new Date(utcTime + 8 * 60 * 60 * 1000);
      const y = bjDate.getUTCFullYear();
      const m = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(bjDate.getUTCDate()).padStart(2, '0');
      const hh = String(bjDate.getUTCHours()).padStart(2, '0');
      const mm = String(bjDate.getUTCMinutes()).padStart(2, '0');
      const datePart = `${y}-${m}-${d}`;
      const timePart = `${hh}:${mm}`;

      const displayTitle = showSpaceTag ? `[${session.space_name}] ${session.food_name || '锁定菜品'}` : (session.food_name || '锁定菜品');
      addEvent(datePart, {
        id: session.id,
        type: 'food',
        title: displayTitle,
        time: timePart || null,
        reason: session.result_reason
      });
    });

    // 6. 获取自定义小备忘事件 (Custom Events)
    let customQuery = `
      SELECT ce.*, u.nickname AS creator_name, s.name AS space_name FROM calendar_custom_events ce
      JOIN spaces s ON ce.space_id = s.id
      LEFT JOIN users u ON ce.created_by = u.id
      WHERE ce.space_id IN (${placeholders})
        AND ce.event_date LIKE ?
    `;
    const customEvents = await db.all(customQuery, [...spaceIds, prefix]);

    customEvents.forEach(item => {
      const displayTitle = showSpaceTag ? `[${item.space_name}] ${item.title}` : item.title;
      addEvent(item.event_date, {
        id: item.id,
        type: 'custom',
        title: displayTitle,
        time: item.event_time || null,
        creator_name: item.creator_name,
        created_by: item.created_by
      });
    });

    // 对每天的日程进行按时间排序 (没有时间的排在最前面)
    Object.keys(eventsByDay).forEach(day => {
      eventsByDay[day].sort((a, b) => {
        if (!a.time) return -1;
        if (!b.time) return 1;
        return a.time.localeCompare(b.time);
      });
    });

    return res.status(200).json({ success: true, year: Number(year), month: Number(month), events: eventsByDay });
  } catch (error) {
    next(error);
  }
});

/**
 * 添加自定义琐事
 * POST /api/calendar/custom-event
 */
router.post('/custom-event', authMiddleware, async (req, res, next) => {
  const { title, event_date, event_time } = req.body;
  const user = req.user;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'ValidationError', message: '事件备忘描述不能为空。' });
  }

  if (!event_date || !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
    return res.status(400).json({ error: 'ValidationError', message: '事件日期格式不正确 (必须为 YYYY-MM-DD)。' });
  }

  if (!user.current_space_id) {
    return res.status(400).json({ error: 'ValidationError', message: '您当前未关联活跃空间。' });
  }

  try {
    const db = getDB();
    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT INTO calendar_custom_events (title, event_date, event_time, created_by, space_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title.trim(), event_date, event_time || null, user.id, user.current_space_id, now]
    );

    const newEvent = await db.get(
      `SELECT ce.*, u.nickname AS creator_name FROM calendar_custom_events ce
       LEFT JOIN users u ON ce.created_by = u.id
       WHERE ce.id = ?`,
      [result.lastID]
    );

    return res.status(201).json({ success: true, event: newEvent });
  } catch (error) {
    next(error);
  }
});

/**
 * 删除自定义琐事
 * DELETE /api/calendar/custom-event/:id
 */
router.delete('/custom-event/:id', authMiddleware, async (req, res, next) => {
  const id = req.params.id;
  const user = req.user;

  try {
    const db = getDB();
    const event = await db.get('SELECT * FROM calendar_custom_events WHERE id = ?', [id]);
    if (!event) {
      return res.status(404).json({ error: 'NotFoundError', message: '未找到该自定义备忘事件。' });
    }

    // 校验用户是否属于该备忘所在的物理空间
    const memberSpaces = await db.all('SELECT space_id FROM space_members WHERE user_id = ?', [user.id]);
    const spaceIds = memberSpaces.map(s => s.space_id);
    const isMember = spaceIds.includes(event.space_id);

    if (!isMember) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权删除此空间下的备忘事件。' });
    }

    await db.run('DELETE FROM calendar_custom_events WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: '删除成功' });
  } catch (error) {
    next(error);
  }
});

export default router;

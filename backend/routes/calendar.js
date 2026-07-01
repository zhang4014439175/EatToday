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

  const userIds = [user.id];
  if (user.partner_id) {
    userIds.push(user.partner_id);
  }

  try {
    const db = getDB();
    const eventsByDay = {};

    const addEvent = (dateStr, event) => {
      if (!dateStr) return;
      const day = dateStr.substring(0, 10);
      if (!eventsByDay[day]) {
        eventsByDay[day] = [];
      }
      eventsByDay[day].push(event);
    };

    // 1. 获取纪念日 (Anniversaries)
    let annQuery = `
      SELECT * FROM anniversaries 
      WHERE created_by IN (${userIds.map(() => '?').join(',')})
        AND (
          (is_yearly = 1 AND SUBSTR(date, 6, 2) = ?)
          OR (is_yearly = 0 AND date LIKE ?)
        )
    `;
    let annParams = [...userIds, monthStr, prefix];
    const anniversaries = await db.all(annQuery, annParams);

    anniversaries.forEach(item => {
      let targetDate = item.date;
      if (item.is_yearly === 1) {
        const md = item.date.substring(5, 10); // "MM-DD"
        targetDate = `${year}-${md}`;
      }
      addEvent(targetDate, {
        id: item.id,
        type: 'anniversary',
        title: item.title,
        time: null,
        is_yearly: item.is_yearly,
        original_date: item.date
      });
    });

    // 2. 获取约会计划 (Date Plans)
    let dateQuery = `
      SELECT * FROM date_plans 
      WHERE ((created_by = ? AND partner_id = ?) OR (created_by = ? AND partner_id = ?))
        AND meeting_time LIKE ?
        AND status != 'rejected'
    `;
    if (!user.partner_id) {
      dateQuery = `
        SELECT * FROM date_plans 
        WHERE created_by = ? 
          AND meeting_time LIKE ?
          AND status != 'rejected'
      `;
    }
    const dateParams = user.partner_id 
      ? [user.id, user.partner_id, user.partner_id, user.id, prefix]
      : [user.id, prefix];
    const datePlans = await db.all(dateQuery, dateParams);

    datePlans.forEach(plan => {
      const timePart = plan.meeting_time.substring(11, 16);
      addEvent(plan.meeting_time, {
        id: plan.id,
        type: 'date',
        title: plan.title,
        time: timePart || null,
        location: plan.meeting_location,
        status: plan.status,
        notes: plan.notes
      });
    });

    // 3. 获取爱心厨房记录 (Kitchen Sessions)
    let kitchenQuery = `
      SELECT * FROM kitchen_sessions 
      WHERE ((diner_id = ? AND chef_id = ?) OR (diner_id = ? AND chef_id = ?))
        AND created_at LIKE ?
        AND status != 'archived'
    `;
    if (!user.partner_id) {
      kitchenQuery = `
        SELECT * FROM kitchen_sessions 
        WHERE (diner_id = ? OR chef_id = ?)
          AND created_at LIKE ?
          AND status != 'archived'
      `;
    }
    const kitchenParams = user.partner_id
      ? [user.id, user.partner_id, user.partner_id, user.id, prefix]
      : [user.id, user.id, prefix];
    const kitchenSessions = await db.all(kitchenQuery, kitchenParams);

    kitchenSessions.forEach(session => {
      const datePart = session.created_at.substring(0, 10);
      const timePart = session.created_at.substring(11, 16);
      addEvent(datePart, {
        id: session.id,
        type: 'kitchen',
        title: `爱心厨：${session.dish_name}`,
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

    // 4. 获取出去吃锁定记录 (Dine Out Locks)
    let foodQuery = `
      SELECT fs.*, fp.name AS food_name FROM food_sessions fs
      LEFT JOIN food_pool fp ON fs.selected_food_id = fp.id
      WHERE ((fs.created_by = ? AND fs.partner_id = ?) OR (fs.created_by = ? AND fs.partner_id = ?))
        AND fs.status = 'locked'
        AND fs.created_at LIKE ?
    `;
    if (!user.partner_id) {
      foodQuery = `
        SELECT fs.*, fp.name AS food_name FROM food_sessions fs
        LEFT JOIN food_pool fp ON fs.selected_food_id = fp.id
        WHERE fs.created_by = ?
          AND fs.status = 'locked'
          AND fs.created_at LIKE ?
      `;
    }
    const foodParams = user.partner_id
      ? [user.id, user.partner_id, user.partner_id, user.id, prefix]
      : [user.id, prefix];
    const foodSessions = await db.all(foodQuery, foodParams);

    foodSessions.forEach(session => {
      const datePart = session.created_at.substring(0, 10);
      addEvent(datePart, {
        id: session.id,
        type: 'food',
        title: `出去吃：${session.food_name || '锁定菜品'}`,
        time: null,
        reason: session.result_reason
      });
    });

    // 5. 获取自定义小备忘事件 (Custom Events)
    let customQuery = `
      SELECT ce.*, u.nickname AS creator_name FROM calendar_custom_events ce
      LEFT JOIN users u ON ce.created_by = u.id
      WHERE ce.created_by IN (${userIds.map(() => '?').join(',')})
        AND ce.event_date LIKE ?
    `;
    let customParams = [...userIds, prefix];
    const customEvents = await db.all(customQuery, customParams);

    customEvents.forEach(item => {
      addEvent(item.event_date, {
        id: item.id,
        type: 'custom',
        title: item.title,
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

  try {
    const db = getDB();
    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT INTO calendar_custom_events (title, event_date, event_time, created_by, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [title.trim(), event_date, event_time || null, user.id, now]
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

    if (event.created_by !== user.id && event.created_by !== user.partner_id) {
      return res.status(403).json({ error: 'ForbiddenError', message: '您无权删除此备忘事件。' });
    }

    await db.run('DELETE FROM calendar_custom_events WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: '删除成功' });
  } catch (error) {
    next(error);
  }
});

export default router;

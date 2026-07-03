import { MOCK_DELAY_MS } from '../utils/config.js';
import {
  ensureUser,
  getCurrentUser,
  getPartner,
  isTodayDateTime,
  loadState,
  nextId,
  publicUser,
  sameCouple,
  saveState
} from './store.js';

function wait() {
  return new Promise(resolve => setTimeout(resolve, MOCK_DELAY_MS));
}

function ok(data) {
  return wait().then(() => data);
}

function fail(message, statusCode = 400, error = 'MockError') {
  return wait().then(() => Promise.reject({ statusCode, message, data: { error, message } }));
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function shiftDateStr(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function withState(handler) {
  const state = loadState();
  const result = handler(state);
  saveState(state);
  return result;
}

function parseUrl(url) {
  const [pathname] = url.split('?');
  return pathname.replace(/\/+$/, '') || '/';
}

function getBody(options) {
  return options.data || {};
}

function getCurrentContext(state) {
  const user = getCurrentUser(state);
  return {
    user,
    partner: getPartner(state, user)
  };
}

function sortDesc(list, field = 'created_at') {
  return [...list].sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')));
}

function sortByEventTimeAsc(list) {
  return [...list].sort((a, b) => {
    const aKey = `${a.event_date || ''} ${a.event_time || '23:59'}`;
    const bKey = `${b.event_date || ''} ${b.event_time || '23:59'}`;
    return aKey.localeCompare(bKey);
  });
}

function pickNearestTimedItem(list, dateField, timeField) {
  const now = new Date();
  const timed = list.map(item => {
    const date = item[dateField];
    const time = item[timeField] || '23:59';
    const when = new Date(`${date}T${time}:00`);
    return { ...item, _diffMs: when.getTime() - now.getTime() };
  }).filter(item => !Number.isNaN(item._diffMs));

  const upcoming = timed.filter(item => item._diffMs >= 0).sort((a, b) => a._diffMs - b._diffMs);
  if (upcoming.length) return upcoming[0];

  return timed
    .filter(item => item._diffMs < 0 && item._diffMs >= -60 * 60 * 1000)
    .sort((a, b) => b._diffMs - a._diffMs)[0] || null;
}

function handleAuth(path, method, options) {
  return withState(state => {
    if (path === '/auth/login' && method === 'POST') {
      const { code, nickname, avatarUrl } = getBody(options);
      const user = ensureUser(state, code || 'mock_user_1', nickname, avatarUrl);
      return ok({
        token: `mock-token-${user.id}`,
        user: publicUser(user)
      });
    }

    const { user, partner } = getCurrentContext(state);

    if (path === '/auth/me' && method === 'GET') {
      return ok({
        user: publicUser(user),
        partner: publicUser(partner)
      });
    }

    if (path === '/auth/pair' && method === 'POST') {
      const { pairCode } = getBody(options);
      const code = String(pairCode || '').trim().toUpperCase();
      const target = state.users.find(item => item.pair_code.toUpperCase() === code);

      if (!target) return fail('未找到该配对码对应的用户', 404, 'NotFoundError');
      if (target.id === user.id) return fail('不能与自己绑定');
      if (user.partner_id) return fail('您已经绑定了伴侣，无法重复绑定');
      if (target.partner_id) return fail('对方已经绑定了伴侣，无法接受您的绑定');

      user.partner_id = target.id;
      target.partner_id = user.id;
      user.updated_at = nowIso();
      target.updated_at = nowIso();

      return ok({
        success: true,
        message: '配对成功',
        partner: publicUser(target)
      });
    }

    if (path === '/auth/unpair' && method === 'POST') {
      if (!user.partner_id) return fail('您当前未绑定伴侣，无需解绑');
      const target = getPartner(state, user);
      if (target) {
        target.partner_id = null;
        target.updated_at = nowIso();
      }
      user.partner_id = null;
      user.updated_at = nowIso();
      return ok({ success: true, message: '已解除情侣绑定关系' });
    }

    return null;
  });
}

function handleAnniversary(path, method, options) {
  return withState(state => {
    const { user } = getCurrentContext(state);

    if (path === '/anniversary' && method === 'GET') {
      const anniversaries = sortDesc(state.anniversaries.filter(item => sameCouple(item, user)), 'date');
      return ok({ anniversaries });
    }

    if (path === '/anniversary/nearest' && method === 'GET') {
      const candidates = state.anniversaries
        .filter(item => sameCouple(item, user))
        .map(item => ({ ...item, daysLeft: daysLeft(item.date, item.is_yearly) }))
        .filter(item => item.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);
      return ok({ anniversary: candidates[0] || null });
    }

    if (path === '/anniversary' && method === 'POST') {
      const { title, date, dateType, isYearly } = getBody(options);
      if (!title || !date) return fail('纪念日主题与日期不能为空');

      const now = nowIso();
      const anniversary = {
        id: nextId(state, 'anniversary'),
        title: String(title).trim(),
        date,
        date_type: Number(dateType || 0),
        is_yearly: Number(isYearly || 0),
        created_by: user.id,
        created_at: now,
        updated_at: now
      };
      state.anniversaries.push(anniversary);
      return ok({ success: true, anniversary });
    }

    const deleteMatch = path.match(/^\/anniversary\/(\d+)$/);
    if (deleteMatch && method === 'DELETE') {
      const id = Number(deleteMatch[1]);
      const index = state.anniversaries.findIndex(item => item.id === id && item.created_by === user.id);
      if (index < 0) return fail('未找到该纪念日记录或无权删除', 404, 'NotFoundError');
      state.anniversaries.splice(index, 1);
      return ok({ success: true, message: '纪念日记录删除成功' });
    }

    return null;
  });
}

function daysLeft(dateStr, isYearly) {
  const current = new Date(today());
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return -1;

  if (!Number(isYearly)) {
    return Math.ceil((target - current) / 86400000);
  }

  target.setFullYear(current.getFullYear());
  if (target < current) {
    target.setFullYear(current.getFullYear() + 1);
  }
  return Math.ceil((target - current) / 86400000);
}

function handleFood(path, method, options) {
  return withState(state => {
    const { user } = getCurrentContext(state);

    if (path === '/food' && method === 'GET') {
      return ok({ foods: sortDesc(state.foods.filter(item => sameCouple(item, user))) });
    }

    if (path === '/food' && method === 'POST') {
      const { name, tags } = getBody(options);
      if (!name || !String(name).trim()) return fail('美食名称不能为空');
      const now = nowIso();
      const food = {
        id: nextId(state, 'food'),
        name: String(name).trim(),
        tags: tags || '',
        created_by: user.id,
        created_at: now,
        updated_at: now
      };
      state.foods.push(food);
      return ok({ success: true, food });
    }

    if (path === '/food/today' && method === 'GET') {
      const session = sortDesc(state.foodSessions.filter(item => {
        return item.status === 'locked' && isFoodSessionVisible(item, user) && isTodayDateTime(item.created_at);
      }), 'updated_at')[0];
      const food = session ? state.foods.find(item => item.id === session.selected_food_id) : null;
      return ok({
        food: food ? { id: food.id, name: food.name, reason: session.result_reason } : null
      });
    }

    if (path === '/food/lock-wheel' && method === 'POST') {
      const { foodId } = getBody(options);
      const food = state.foods.find(item => item.id === Number(foodId) && sameCouple(item, user));
      if (!food) return fail('未找到该美食或您无权锁定它', 404, 'NotFoundError');

      const now = nowIso();
      let session = state.foodSessions.find(item => item.status === 'locked' && isFoodSessionVisible(item, user) && isTodayDateTime(item.created_at));
      if (!session) {
        session = {
          id: nextId(state, 'foodSession'),
          created_by: user.id,
          partner_id: user.partner_id || null,
          status: 'locked',
          selected_food_id: Number(foodId),
          selected_food_name: food.name,
          result_reason: 'random',
          created_at: now,
          updated_at: now
        };
        state.foodSessions.push(session);
      } else {
        session.selected_food_id = Number(foodId);
        session.selected_food_name = food.name;
        session.result_reason = 'random';
        session.updated_at = now;
      }
      return ok({ success: true, message: '已锁定今日美食', session });
    }

    if (path === '/food/session' && method === 'POST') {
      if (!user.partner_id) return fail('您必须先配对伴侣才能开启投票会话');
      const now = nowIso();
      let session = state.foodSessions.find(item => isFoodSessionVisible(item, user) && isTodayDateTime(item.created_at));
      if (!session) {
        session = {
          id: nextId(state, 'foodSession'),
          created_by: user.id,
          partner_id: user.partner_id,
          status: 'voting',
          selected_food_id: null,
          selected_food_name: '',
          result_reason: '',
          created_at: now,
          updated_at: now
        };
        state.foodSessions.push(session);
      } else {
        state.foodVotes = state.foodVotes.filter(item => item.session_id !== session.id);
        session.status = 'voting';
        session.selected_food_id = null;
        session.selected_food_name = '';
        session.result_reason = '';
        session.updated_at = now;
      }
      return ok({ session });
    }

    if (path === '/food/session/active' && method === 'GET') {
      const session = sortDesc(state.foodSessions.filter(item => isFoodSessionVisible(item, user) && isTodayDateTime(item.created_at)), 'updated_at')[0] || null;
      const votes = session ? state.foodVotes.filter(item => item.session_id === session.id) : [];
      return ok({ session, votes });
    }

    const voteMatch = path.match(/^\/food\/session\/(\d+)\/vote$/);
    if (voteMatch && method === 'POST') {
      const sessionId = Number(voteMatch[1]);
      const session = state.foodSessions.find(item => item.id === sessionId && isFoodSessionVisible(item, user));
      if (!session) return fail('未找到该投票会话', 404, 'NotFoundError');
      if (session.status !== 'voting') return fail('该选菜会话投票已结束');

      const foodIds = [...new Set((getBody(options).foodIds || []).map(Number))].slice(0, 3);
      if (!foodIds.length) return fail('投票数量必须在 1 ~ 3 个之间');
      const validFoods = foodIds.filter(id => state.foods.some(food => food.id === id && sameCouple(food, user)));
      if (validFoods.length !== foodIds.length) return fail('投票中包含不存在或无权选择的菜品');

      state.foodVotes = state.foodVotes.filter(item => !(item.session_id === sessionId && item.user_id === user.id));
      for (const foodId of validFoods) {
        state.foodVotes.push({
          id: `${sessionId}-${user.id}-${foodId}`,
          session_id: sessionId,
          user_id: user.id,
          food_id: foodId,
          created_at: nowIso()
        });
      }

      const partnerVotes = state.foodVotes.filter(item => item.session_id === sessionId && item.user_id === session.partner_id);
      if (!partnerVotes.length && session.partner_id) {
        const partnerChoices = state.foods.filter(food => sameCouple(food, user)).slice(0, 3).map(food => food.id);
        for (const foodId of partnerChoices) {
          state.foodVotes.push({
            id: `${sessionId}-${session.partner_id}-${foodId}`,
            session_id: sessionId,
            user_id: session.partner_id,
            food_id: foodId,
            created_at: nowIso()
          });
        }
      }

      lockFoodSessionIfReady(state, session);
      return ok({ success: true, session });
    }

    const deleteMatch = path.match(/^\/food\/(\d+)$/);
    if (deleteMatch && method === 'DELETE') {
      const id = Number(deleteMatch[1]);
      const index = state.foods.findIndex(item => item.id === id && sameCouple(item, user));
      if (index < 0) return fail('未找到该美食项目或无权删除', 404, 'NotFoundError');
      state.foods.splice(index, 1);
      return ok({ success: true, message: '删除成功' });
    }

    return null;
  });
}

function isFoodSessionVisible(session, user) {
  return session.created_by === user.id || session.partner_id === user.id || session.created_by === user.partner_id;
}

function lockFoodSessionIfReady(state, session) {
  const userIds = [session.created_by, session.partner_id].filter(Boolean);
  const grouped = userIds.map(userId => state.foodVotes.filter(item => item.session_id === session.id && item.user_id === userId).map(item => item.food_id));
  if (grouped.length < 2 || grouped.some(list => list.length === 0)) return;

  const intersection = grouped[0].filter(id => grouped[1].includes(id));
  const pool = intersection.length ? intersection : [...new Set([...grouped[0], ...grouped[1]])];
  const selectedId = pool[0];
  const food = state.foods.find(item => item.id === selectedId);
  session.status = 'locked';
  session.selected_food_id = selectedId;
  session.selected_food_name = food ? food.name : '';
  session.result_reason = intersection.length ? 'intersection' : 'random';
  session.updated_at = nowIso();
}

function handleDate(path, method, options) {
  return withState(state => {
    const { user } = getCurrentContext(state);

    if (path === '/date/wishlist' && method === 'GET') {
      return ok({ wishlist: sortDesc(state.wishlist.filter(item => sameCouple(item, user))) });
    }

    if (path === '/date/wishlist' && method === 'POST') {
      const { name } = getBody(options);
      if (!name || !String(name).trim()) return fail('愿望内容不能为空');
      const wish = {
        id: nextId(state, 'wishlist'),
        name: String(name).trim(),
        created_by: user.id,
        created_at: nowIso()
      };
      state.wishlist.push(wish);
      return ok({ success: true, wish });
    }

    const deleteWishMatch = path.match(/^\/date\/wishlist\/(\d+)$/);
    if (deleteWishMatch && method === 'DELETE') {
      const id = Number(deleteWishMatch[1]);
      const index = state.wishlist.findIndex(item => item.id === id && sameCouple(item, user));
      if (index < 0) return fail('未找到该约会愿望项目或无权删除', 404, 'NotFoundError');
      state.wishlist.splice(index, 1);
      return ok({ success: true, message: '愿望项目已移除' });
    }

    if (path === '/date' && method === 'GET') {
      const plans = sortDesc(state.datePlans.filter(item => item.created_by === user.id || item.partner_id === user.id), 'meeting_time');
      return ok({ plans });
    }

    if (path === '/date/today' && method === 'GET') {
      const plan = state.datePlans.find(item => {
        return item.status === 'accepted' && (item.created_by === user.id || item.partner_id === user.id) && isTodayDateTime(item.meeting_time);
      }) || null;
      return ok({ plan });
    }

    if (path === '/date' && method === 'POST') {
      if (!user.partner_id) return fail('您必须先配对伴侣才能发起去哪玩提案');
      const { title, meetingTime, meetingLocation, notes } = getBody(options);
      if (!title || !meetingTime) return fail('去哪玩主题与见面时间不能为空');
      const now = nowIso();
      const plan = {
        id: nextId(state, 'datePlan'),
        title: String(title).trim(),
        meeting_time: meetingTime,
        meeting_location: meetingLocation || '',
        notes: notes || '',
        status: 'pending',
        revision_note: '',
        created_by: user.id,
        partner_id: user.partner_id,
        created_at: now,
        updated_at: now
      };
      state.datePlans.push(plan);
      return ok({ success: true, plan });
    }

    const actionMatch = path.match(/^\/date\/(\d+)\/(accept|reject|revision)$/);
    if (actionMatch && method === 'POST') {
      const id = Number(actionMatch[1]);
      const action = actionMatch[2];
      const plan = state.datePlans.find(item => item.id === id);
      if (!plan) return fail('未找到该去哪玩提案', 404, 'NotFoundError');
      if (plan.partner_id !== user.id) return fail('您无权处理该去哪玩提案', 403, 'ForbiddenError');

      if (action === 'accept') plan.status = 'accepted';
      if (action === 'reject') plan.status = 'rejected';
      if (action === 'revision') {
        const { revisionNote } = getBody(options);
        if (!revisionNote || !String(revisionNote).trim()) return fail('修改建议说明不能为空');
        plan.status = 'revision_requested';
        plan.revision_note = String(revisionNote).trim();
      }
      plan.updated_at = nowIso();
      return ok({ success: true, message: '操作成功', plan });
    }

    const deleteMatch = path.match(/^\/date\/(\d+)$/);
    if (deleteMatch && method === 'DELETE') {
      const id = Number(deleteMatch[1]);
      const index = state.datePlans.findIndex(item => item.id === id && (item.created_by === user.id || item.partner_id === user.id));
      if (index < 0) return fail('未找到该行程记录或无权删除', 404, 'NotFoundError');
      state.datePlans.splice(index, 1);
      return ok({ success: true, message: '行程记录删除/撤销成功' });
    }

    return null;
  });
}

function handleCalendar(path, method, options) {
  return withState(state => {
    const { user } = getCurrentContext(state);

    if (!Array.isArray(state.customEvents)) {
      state.customEvents = [];
    }
    if (!state.nextIds.customEvent) {
      const maxId = state.customEvents.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
      state.nextIds.customEvent = maxId + 1;
    }

    if (path === '/calendar/month' && method === 'GET') {
      const query = (options.url.split('?')[1] || '').split('&').reduce((acc, pair) => {
        const [key, value] = pair.split('=');
        if (key) acc[key] = decodeURIComponent(value || '');
        return acc;
      }, {});
      const year = Number(query.year || new Date().getFullYear());
      const month = Number(query.month || new Date().getMonth() + 1);
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const events = {};

      const addEvent = (dateStr, event) => {
        if (!dateStr || !dateStr.startsWith(prefix)) return;
        if (!events[dateStr]) events[dateStr] = [];
        events[dateStr].push(event);
      };

      state.anniversaries
        .filter(item => sameCouple(item, user))
        .forEach(item => {
          const dateStr = Number(item.is_yearly) ? `${year}-${item.date.substring(5, 10)}` : item.date;
          addEvent(dateStr, { id: item.id, type: 'anniversary', title: item.title, time: null });
        });

      state.datePlans
        .filter(item => item.status !== 'rejected' && (item.created_by === user.id || item.partner_id === user.id))
        .forEach(item => {
          const dateStr = String(item.meeting_time || '').substring(0, 10);
          const time = String(item.meeting_time || '').substring(11, 16);
          addEvent(dateStr, {
            id: item.id,
            type: 'date',
            title: item.title,
            time: time || null,
            location: item.meeting_location,
            status: item.status
          });
        });

      state.foodSessions
        .filter(item => item.status === 'locked' && isFoodSessionVisible(item, user))
        .forEach(item => {
          const dateStr = formatDate(new Date(item.created_at));
          const time = new Date(item.created_at).toTimeString().substring(0, 5);
          addEvent(dateStr, {
            id: item.id,
            type: 'food',
            title: item.selected_food_name || '锁定菜品',
            time,
            reason: item.result_reason
          });
        });

      state.customEvents
        .filter(item => sameCouple(item, user))
        .forEach(item => {
          addEvent(item.event_date, {
            id: item.id,
            type: 'custom',
            title: item.title,
            time: item.event_time || null,
            creator_name: state.users.find(u => u.id === item.created_by)?.nickname || '',
            created_by: item.created_by,
            space_id: item.space_id || 1,
            space_name: item.space_name || '本地模拟空间'
          });
        });

      Object.keys(events).forEach(day => {
        events[day].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
      });

      return ok({ success: true, year, month, events });
    }

    if (path === '/calendar/custom-events' && method === 'GET') {
      const events = sortDesc(
        state.customEvents.filter(item => sameCouple(item, user)).map(item => ({
          ...item,
          creator_name: state.users.find(u => u.id === item.created_by)?.nickname || '',
          space_id: item.space_id || 1,
          space_name: item.space_name || '本地模拟空间'
        })),
        'event_date'
      );
      return ok({ success: true, events });
    }

    if (path === '/calendar/custom-events/nearest' && method === 'GET') {
      const since = shiftDateStr(today(), -1);
      const candidates = sortByEventTimeAsc(state.customEvents.filter(item => sameCouple(item, user) && item.event_date >= since));
      return ok({ success: true, event: pickNearestTimedItem(candidates, 'event_date', 'event_time') });
    }

    if (path === '/calendar/custom-event' && method === 'POST') {
      const { title, event_date, event_time, spaceId } = getBody(options);
      if (!title || !String(title).trim()) return fail('事件备忘描述不能为空');
      if (!event_date) return fail('事件日期不能为空');
      const event = {
        id: nextId(state, 'customEvent'),
        title: String(title).trim(),
        event_date,
        event_time: event_time || null,
        space_id: Number(spaceId || 1),
        space_name: '本地模拟空间',
        created_by: user.id,
        created_at: nowIso()
      };
      state.customEvents.push(event);
      return ok({ success: true, event });
    }

    const deleteMatch = path.match(/^\/calendar\/custom-event\/(\d+)$/);
    if (deleteMatch && method === 'DELETE') {
      const id = Number(deleteMatch[1]);
      const index = state.customEvents.findIndex(item => item.id === id && sameCouple(item, user));
      if (index < 0) return fail('未找到该自定义备忘事件', 404, 'NotFoundError');
      state.customEvents.splice(index, 1);
      return ok({ success: true, message: '删除成功' });
    }

    return null;
  });
}

export function mockRequest(options) {
  const path = parseUrl(options.url || '');
  const method = (options.method || 'GET').toUpperCase();

  const handlers = [handleAuth, handleAnniversary, handleFood, handleDate, handleCalendar];
  for (const handler of handlers) {
    const result = handler(path, method, options);
    if (result) return result;
  }

  return fail(`Mock 接口未实现: ${method} ${path}`, 404, 'NotFoundError');
}

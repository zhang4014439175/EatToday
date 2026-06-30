const STORAGE_KEY = 'eat_today_mock_state_v1';

function today() {
  return new Date().toISOString().split('T')[0];
}

function nowIso() {
  return new Date().toISOString();
}

function makePairCode(id) {
  return `LOVE${String(id).padStart(2, '0')}`;
}

function createDefaultState() {
  const now = nowIso();

  return {
    currentUserId: null,
    nextIds: {
      user: 3,
      anniversary: 3,
      food: 7,
      foodSession: 2,
      datePlan: 4,
      wishlist: 4
    },
    users: [
      {
        id: 1,
        openid: 'mock_openid_primary',
        pair_code: 'LOV520',
        nickname: '本地测试用户',
        avatar_url: '',
        partner_id: null,
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        openid: 'mock_openid_partner',
        pair_code: 'TA520',
        nickname: '另一半',
        avatar_url: '',
        partner_id: null,
        created_at: now,
        updated_at: now
      }
    ],
    anniversaries: [
      { id: 1, title: '我们第一次相遇', date: '2025-05-20', date_type: 0, is_yearly: 1, created_by: 1, created_at: now, updated_at: now },
      { id: 2, title: '第一次一起看电影', date: '2025-06-01', date_type: 0, is_yearly: 0, created_by: 1, created_at: now, updated_at: now }
    ],
    foods: [
      { id: 1, name: '火锅', tags: '热闹,辣', created_by: 1, created_at: now, updated_at: now },
      { id: 2, name: '烤肉', tags: '肉食', created_by: 1, created_at: now, updated_at: now },
      { id: 3, name: '螺蛳粉', tags: '重口味', created_by: 1, created_at: now, updated_at: now },
      { id: 4, name: '寿司', tags: '清爽', created_by: 2, created_at: now, updated_at: now },
      { id: 5, name: '麻辣烫', tags: '随便吃', created_by: 2, created_at: now, updated_at: now },
      { id: 6, name: '汉堡炸鸡', tags: '快乐', created_by: 1, created_at: now, updated_at: now }
    ],
    foodSessions: [],
    foodVotes: [],
    datePlans: [
      {
        id: 1,
        title: '去看周末晚上的电影',
        meeting_time: `${today()} 19:30`,
        meeting_location: '万达影城',
        notes: '提前买爆米花',
        status: 'pending',
        revision_note: '',
        created_by: 2,
        partner_id: 1,
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        title: '一起去公园散步',
        meeting_time: `${today()} 16:00`,
        meeting_location: '滨江公园',
        notes: '带一杯热饮',
        status: 'accepted',
        revision_note: '',
        created_by: 1,
        partner_id: 2,
        created_at: now,
        updated_at: now
      },
      {
        id: 3,
        title: '吃一顿不赶时间的火锅',
        meeting_time: `${today()} 18:30`,
        meeting_location: '大悦城',
        notes: '可以慢慢吃',
        status: 'revision_requested',
        revision_note: '我可能会晚一点，改到 19:00 好不好？',
        created_by: 1,
        partner_id: 2,
        created_at: now,
        updated_at: now
      }
    ],
    wishlist: [
      { id: 1, name: '一起去抓娃娃', created_by: 1, created_at: now },
      { id: 2, name: '去海洋馆看水母', created_by: 1, created_at: now },
      { id: 3, name: '看一次海边日出', created_by: 2, created_at: now }
    ]
  };
}

function canUseWxStorage() {
  return typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync;
}

let memoryState = null;

export function loadState() {
  if (canUseWxStorage()) {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn('[Mock] 解析缓存失败，将重置 mock 数据:', error);
      }
    }
  }

  if (!memoryState) {
    memoryState = createDefaultState();
  }
  return memoryState;
}

export function saveState(state) {
  if (canUseWxStorage()) {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(state));
  }
  memoryState = state;
}

export function resetState() {
  const state = createDefaultState();
  saveState(state);
  return state;
}

export function nextId(state, key) {
  const id = state.nextIds[key];
  state.nextIds[key] += 1;
  return id;
}

export function ensureUser(state, code, nickname, avatarUrl) {
  const openid = code && code.includes('partner') ? 'mock_openid_partner' : 'mock_openid_primary';
  let user = state.users.find(item => item.openid === openid);
  const now = nowIso();

  if (!user) {
    const id = nextId(state, 'user');
    user = {
      id,
      openid,
      pair_code: makePairCode(id),
      nickname: nickname || `测试用户${id}`,
      avatar_url: avatarUrl || '',
      partner_id: null,
      created_at: now,
      updated_at: now
    };
    state.users.push(user);
  } else {
    user.nickname = nickname || user.nickname;
    user.avatar_url = avatarUrl || user.avatar_url;
    user.updated_at = now;
  }

  state.currentUserId = user.id;
  return user;
}

export function getCurrentUser(state) {
  const user = state.users.find(item => item.id === state.currentUserId);
  return user || state.users[0];
}

export function getPartner(state, user) {
  if (!user || !user.partner_id) return null;
  return state.users.find(item => item.id === user.partner_id) || null;
}

export function publicUser(user) {
  if (!user) return null;
  const { openid, ...rest } = user;
  return { ...rest };
}

export function sameCouple(item, user, key = 'created_by') {
  return item[key] === user.id || (user.partner_id && item[key] === user.partner_id);
}

export function isTodayDateTime(value) {
  return typeof value === 'string' && value.startsWith(today());
}

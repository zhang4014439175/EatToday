(function () {
  const storageKey = 'eat_today_h5_preview_v1';
  const view = document.querySelector('#view');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const resetBtn = document.querySelector('#resetBtn');
  const headerRecipeBtn = document.querySelector('#headerRecipeBtn');

  let activeView = 'home';
  let selectedVotes = [];
  let wheelRotation = 0;

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function defaultState() {
    const now = nowIso();
    return {
      user: {
        id: 1,
        nickname: '本地测试用户',
        pairCode: 'LOV520',
        partnerId: null,
        createdAt: now
      },
      partner: {
        id: 2,
        nickname: '另一半',
        pairCode: 'TA520',
        partnerId: null
      },
      anniversaries: [
        { id: 1, title: '我们第一次相遇', date: '2025-05-20', yearly: true },
        { id: 2, title: '第一次一起看电影', date: '2025-06-01', yearly: false }
      ],
      kitchenSession: null,
      cookedDishPhotoTemp: null,
      eatMode: 'home',
      cart: {},
      activeCategory: 'signature',
      showConfirmModal: false,
      recipeCurrentCategory: 'home',
      recipeBatchMode: false,
      recipeSelectedIds: [],
      showRecipeModal: false,
      recipeEditMode: false,
      recipeFormId: null,
      recipeFormName: '',
      recipeFormTags: '',
      recipeFormCategory: 'home',
      foods: [
        { id: 1, name: '火锅 🍲', tags: '拿手菜,热闹,辣', category: 'home', image_url: '' },
        { id: 2, name: '烤肉 🥓', tags: '招牌菜,肉食', category: 'home', image_url: '' },
        { id: 3, name: '螺蛳粉 🍜', tags: '特色,重口味', category: 'home', image_url: '' },
        { id: 4, name: '日料寿司 🍣', tags: '精致,清爽', category: 'out', image_url: '' },
        { id: 5, name: '麻辣烫 🍢', tags: '街边,小吃', category: 'out', image_url: '' },
        { id: 6, name: '汉堡炸鸡 🍔', tags: '快乐肥宅', category: 'out', image_url: '' }
      ],
      todayFood: null,
      voteSession: null,
      datePlans: [
        {
          id: 1,
          title: '去看周末晚上的电影',
          time: `${today()} 19:30`,
          location: '万达影城',
          notes: '提前买爆米花',
          status: 'pending',
          revision: '',
          createdBy: 2
        },
        {
          id: 2,
          title: '一起去公园散步',
          time: `${today()} 16:00`,
          location: '滨江公园',
          notes: '带一杯热饮',
          status: 'accepted',
          revision: '',
          createdBy: 1
        }
      ],
      wishlist: [
        { id: 1, name: '一起去抓娃娃' },
        { id: 2, name: '去海洋馆看水母' },
        { id: 3, name: '看一次海边日出' }
      ],
      calendarYear: new Date().getFullYear(),
      calendarMonth: new Date().getMonth() + 1,
      calendarSelectedDateStr: today(),
      calendarCustomEvents: [
        { id: 1, title: '一起去拿快递 📦', event_date: today(), event_time: '15:30' }
      ],
      showCalendarCustomDialog: false,
      calendarExpanded: false
    };
  }

  function loadState() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultState();
    try {
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch {
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function nextId(list) {
    return list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  }

  function isPaired() {
    return Boolean(state.user.partnerId);
  }

  function html(strings, ...values) {
    return strings.reduce((acc, string, index) => acc + string + (values[index] ?? ''), '');
  }

  function escapeText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function daysTogether() {
    const start = new Date(state.user.createdAt);
    return Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000));
  }

  function daysLeft(date, yearly) {
    const current = new Date(today());
    const target = new Date(date);
    if (!yearly) return Math.ceil((target - current) / 86400000);
    target.setFullYear(current.getFullYear());
    if (target < current) target.setFullYear(current.getFullYear() + 1);
    return Math.ceil((target - current) / 86400000);
  }

  function nearestAnniversary() {
    return state.anniversaries
      .map(item => ({ ...item, days: daysLeft(item.date, item.yearly) }))
      .filter(item => item.days >= 0)
      .sort((a, b) => a.days - b.days)[0];
  }

  function todayAcceptedDate() {
    return state.datePlans.find(plan => plan.status === 'accepted' && plan.time.startsWith(today()));
  }

  function getH5EventsForDay(dateStr) {
    const events = [];
    const year = Number(dateStr.substring(0, 4));
    const monthVal = dateStr.substring(5, 7);
    const dayVal = dateStr.substring(8, 10);

    // 1. Anniversaries
    state.anniversaries.forEach(ann => {
      let isMatch = false;
      if (ann.yearly) {
        isMatch = ann.date.endsWith(`${monthVal}-${dayVal}`);
      } else {
        isMatch = ann.date === dateStr;
      }
      if (isMatch) {
        events.push({
          id: ann.id,
          type: 'anniversary',
          title: ann.title,
          time: null
        });
      }
    });

    // 2. Date Plans
    state.datePlans.forEach(plan => {
      if (plan.status !== 'rejected' && plan.time.startsWith(dateStr)) {
        const timePart = plan.time.substring(11, 16);
        events.push({
          id: plan.id,
          type: 'date',
          title: plan.title,
          time: timePart || null,
          location: plan.location
        });
      }
    });

    // 3. Dine Out
    if (state.todayFood && dateStr === today()) {
      events.push({
        id: 999,
        type: 'food',
        title: `出去吃：${state.todayFood.name}`,
        time: null
      });
    }

    // 4. Custom Events
    state.calendarCustomEvents.forEach(item => {
      if (item.event_date === dateStr) {
        events.push({
          id: item.id,
          type: 'custom',
          title: item.title,
          time: item.event_time || null
        });
      }
    });

    // Sort by time
    events.sort((a, b) => {
      if (!a.time) return -1;
      if (!b.time) return 1;
      return a.time.localeCompare(b.time);
    });

    return events;
  }

  function renderH5Calendar() {
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const selectedDate = state.calendarSelectedDateStr;
    const todayStr = today();

    let days = [];

    if (!state.calendarExpanded) {
      // 14天简版视图：本周周日至下周周六
      const todayDate = new Date();
      const start = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - todayDate.getDay());
      for (let i = 0; i < 14; i++) {
        const dObj = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const yVal = dObj.getFullYear();
        const mVal = String(dObj.getMonth() + 1).padStart(2, '0');
        const dVal = String(dObj.getDate()).padStart(2, '0');
        const dateStr = `${yVal}-${mVal}-${dVal}`;
        days.push({
          year: yVal,
          month: dObj.getMonth() + 1,
          day: dObj.getDate(),
          dateStr,
          isCurrentMonth: dObj.getMonth() + 1 === month
        });
      }
    } else {
      // 完整月份视图
      const firstDayIndex = new Date(year, month - 1, 1).getDay();
      const totalDays = new Date(year, month, 0).getDate();
      const prevMonthTotalDays = new Date(year, month - 1, 0).getDate();

      // Previous month padding
      for (let i = firstDayIndex - 1; i >= 0; i--) {
        const d = prevMonthTotalDays - i;
        const m = month === 1 ? 12 : month - 1;
        const y = month === 1 ? year - 1 : year;
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({ year: y, month: m, day: d, dateStr, isCurrentMonth: false });
      }

      // Current month days
      for (let d = 1; d <= totalDays; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({ year, month, day: d, dateStr, isCurrentMonth: true });
      }

      // Next month padding
      const totalGridCells = (firstDayIndex + totalDays) <= 35 ? 35 : 42;
      const remaining = totalGridCells - days.length;
      for (let d = 1; d <= remaining; d++) {
        const m = month === 12 ? 1 : month + 1;
        const y = month === 12 ? year + 1 : year;
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({ year: y, month: m, day: d, dateStr, isCurrentMonth: false });
      }
    }

    return html`
      <div class="card calendar-card" style="padding: 16px 12px; margin-bottom: 16px; border: 1px solid rgba(45,41,56,0.04); background:#fff; border-radius:14px; box-shadow:var(--shadow);">
        <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <div class="row" style="gap: 8px;">
            <button class="btn secondary" data-action="cal-prev-month" style="min-height: 28px; height: 28px; padding: 0 10px; font-size: 11px; margin: 0; box-shadow: none;">◀</button>
            <strong style="font-size: 15px; color: var(--ink);">${year}年${month}月</strong>
            <button class="btn secondary" data-action="cal-next-month" style="min-height: 28px; height: 28px; padding: 0 10px; font-size: 11px; margin: 0; box-shadow: none;">▶</button>
          </div>
          <button class="btn secondary" data-action="cal-back-today" style="min-height: 28px; height: 28px; padding: 0 12px; font-size: 11px; margin: 0; box-shadow: none;">回今天</button>
        </div>

        <div class="row" style="margin-bottom: 8px; justify-content: space-around;">
          <span style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: #FF6B6B;">日</span>
          <span style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: var(--muted);">一</span>
          <span style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: var(--muted);">二</span>
          <span style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: var(--muted);">三</span>
          <span style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: var(--muted);">四</span>
          <span style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: var(--muted);">五</span>
          <span style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: #FF6B6B;">六</span>
        </div>

        <div class="calendar-grid" style="display: flex; flex-wrap: wrap; width: 100%;">
          ${days.map(item => {
            const isToday = item.dateStr === todayStr;
            const isSelected = item.dateStr === selectedDate;
            const dayEvents = getH5EventsForDay(item.dateStr);
            
            const hasAnniversary = dayEvents.some(e => e.type === 'anniversary');
            const hasDate = dayEvents.some(e => e.type === 'date');
            const hasKitchen = dayEvents.some(e => e.type === 'kitchen');
            const hasFood = dayEvents.some(e => e.type === 'food');
            const hasCustom = dayEvents.some(e => e.type === 'custom');

            let bg = 'transparent';
            let color = 'var(--ink)';
            let border = 'none';

            if (isSelected) {
              bg = 'var(--rose-soft)';
              color = 'var(--rose)';
              border = '1px solid rgba(124, 105, 201, 0.2)';
            }
            if (isToday) {
              bg = 'var(--rose)';
              color = '#ffffff';
            }

            return `
              <div class="grid-day" 
                   data-action="cal-select-day" 
                   data-date="${item.dateStr}"
                   style="width: 14.28%; height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; border-radius: 8px; margin: 2px 0; cursor: pointer; background: ${bg}; color: ${color}; border: ${border}; box-sizing: border-box; opacity: ${item.isCurrentMonth ? 1 : 0.4};">
                <span style="font-size: 13px; font-weight: 700;">${item.day}</span>
                <div class="day-dots" style="display: flex; justify-content: center; gap: 2px; margin-top: 2px; height: 4px; width: 100%;">
                  ${hasAnniversary ? `<span class="dot" style="width: 4px; height: 4px; border-radius: 50%; background: ${isToday ? '#fff' : '#FF6B6B'};"></span>` : ''}
                  ${hasDate ? `<span class="dot" style="width: 4px; height: 4px; border-radius: 50%; background: ${isToday ? '#fff' : '#7C69C9'};"></span>` : ''}
                  ${hasKitchen ? `<span class="dot" style="width: 4px; height: 4px; border-radius: 50%; background: ${isToday ? '#fff' : '#2A9D8F'};"></span>` : ''}
                  ${hasFood ? `<span class="dot" style="width: 4px; height: 4px; border-radius: 50%; background: ${isToday ? '#fff' : '#E9C46A'};"></span>` : ''}
                  ${hasCustom ? `<span class="dot" style="width: 4px; height: 4px; border-radius: 50%; background: ${isToday ? '#fff' : '#4A90E2'};"></span>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="calendar-toggle-btn" 
             data-action="cal-toggle" 
             style="display: flex; justify-content: center; align-items: center; padding: 8px 0 0; margin-top: 10px; border-top: 1px solid rgba(45, 41, 56, 0.05); font-size: 11px; font-weight: 700; color: var(--rose); cursor: pointer; width: 100%;">
          ${state.calendarExpanded ? '▲ 收起日历' : '▼ 展开完整日历'}
        </div>
      </div>
    `;
  }

  function renderH5Agenda() {
    const selectedDate = state.calendarSelectedDateStr;
    const events = getH5EventsForDay(selectedDate);
    const typeTextMap = {
      anniversary: '纪念日',
      date: '约会',
      kitchen: '爱心厨',
      food: '出去吃',
      custom: '备忘'
    };

    return html`
      <div class="card agenda-drawer" style="padding: 16px; margin-bottom: 16px; border: 1px solid rgba(45,41,56,0.04); background:#fff; border-radius:14px; box-shadow:var(--shadow);">
        <div class="row" style="justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(45, 41, 56, 0.06); padding-bottom: 10px; margin-bottom: 12px; width:100%;">
          <strong style="font-size: 13px; color: var(--ink);">📅 ${selectedDate} 的日常</strong>
          <button class="btn secondary" data-action="cal-show-add-dialog" style="min-height: 26px; height: 26px; padding: 0 10px; font-size: 10px; margin: 0; box-shadow: none;">➕ 添加备忘</button>
        </div>

        <div class="agenda-list" style="display: flex; flex-direction: column; width: 100%;">
          ${events.map((item, index) => {
            return `
              <div class="row" style="margin-bottom: 12px; align-items: flex-start; justify-content: flex-start; width: 100%;">
                <div style="display: flex; flex-direction: column; align-items: center; width: 12px; margin-right: 8px; margin-top: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${
                    item.type === 'anniversary' ? '#FF6B6B' :
                    item.type === 'date' ? '#7C69C9' :
                    item.type === 'kitchen' ? '#2A9D8F' :
                    item.type === 'food' ? '#E9C46A' : '#4A90E2'
                  };"></span>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column;">
                  ${item.time ? `<span style="font-size: 10px; color: var(--muted); font-weight: 700; margin-bottom: 2px;">${item.time}</span>` : ''}
                  <span style="font-size: 12px; color: var(--ink); font-weight: 500;">
                    <strong style="color: ${
                      item.type === 'anniversary' ? '#FF6B6B' :
                      item.type === 'date' ? '#7C69C9' :
                      item.type === 'kitchen' ? '#2A9D8F' :
                      item.type === 'food' ? '#E9C46A' : '#4A90E2'
                    }; font-weight: 700; margin-right: 4px;">[${typeTextMap[item.type]}]</strong>
                    ${escapeText(item.title)}
                  </span>
                </div>
                ${item.type === 'custom' ? `
                  <span data-action="cal-delete-custom" data-id="${item.id}" style="font-size: 16px; color: var(--muted); cursor: pointer; padding: 0 4px;">✕</span>
                ` : ''}
              </div>
            `;
          }).join('')}

          ${events.length === 0 ? `
            <div style="text-align: center; padding: 20px 0; font-size: 11px; color: var(--muted);">
              这天平平淡淡，没有记录备忘，点击上方「添加备忘」记一笔吧！
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderH5CalendarDialog() {
    if (!state.showCalendarCustomDialog) return '';
    return html`
      <div class="order-confirm-modal" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(45, 41, 56, 0.5); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <div class="modal-content" style="background: #ffffff; border-radius: 16px; width: 100%; max-width: 320px; padding: 18px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); box-sizing: border-box; position: relative; z-index: 101;">
          <div class="row" style="margin-bottom: 14px; width: 100%;">
            <h3 style="margin: 0; font-weight: 900; font-size: 14px; color: var(--ink);">📝 添加一日备忘</h3>
            <span data-action="cal-hide-add-dialog" style="font-size: 22px; cursor: pointer; color: var(--muted); line-height: 1;">×</span>
          </div>
          <div class="stack" style="width: 100%; gap: 12px; margin-bottom: 16px;">
            <div>
              <label style="font-size: 11px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 4px;">备忘内容</label>
              <input id="calCustomText" class="input" placeholder="输入要做的琐事或提醒" />
            </div>
            <div>
              <label style="font-size: 11px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 4px;">具体时间 (选填)</label>
              <input id="calCustomTime" class="input" type="time" value="12:00" />
            </div>
          </div>
          <div class="row" style="gap: 8px; width: 100%;">
            <button class="btn secondary" data-action="cal-hide-add-dialog" style="flex: 1; margin:0; min-height: 38px; height: 38px; font-size: 12px; box-shadow: none;">取消</button>
            <button class="btn" data-action="cal-submit-custom" style="flex: 1; margin:0; min-height: 38px; height: 38px; font-size: 12px;">确认保存</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderHome() {
    const ann = nearestAnniversary();
    const plan = todayAcceptedDate();
    return html`
      <!-- 首页情侣互动日历 -->
      ${renderH5Calendar()}
      ${renderH5Agenda()}
      ${renderH5CalendarDialog()}

      <section class="card">
        <h3>今日吃什么</h3>
        ${state.todayFood ? `<div class="list-item"><strong>${escapeText(state.todayFood.name)}</strong><p class="muted">来源：${state.todayFood.reason}</p></div>` : '<div class="empty">还没有锁定今日美食</div>'}
      </section>

      <section class="card">
        <h3>今日去哪玩</h3>
        ${plan ? `<div class="list-item"><strong>${escapeText(plan.title)}</strong><p class="muted">${escapeText(plan.time)} · ${escapeText(plan.location)}</p></div>` : '<div class="empty">今天还没有确认的游玩计划</div>'}
      </section>

      <section class="card">
        <h3>最近纪念日</h3>
        ${ann ? `<div class="list-item"><strong>${escapeText(ann.title)}</strong><p class="muted">还有 ${ann.days} 天 · ${escapeText(ann.date)}</p></div>` : '<div class="empty">还没有纪念日</div>'}
      </section>
    `;
  }

  function renderFood() {
    const eatMode = state.eatMode || 'home';
    
    let foodBody = '';
    if (eatMode === 'home') {
      foodBody = html`
        <section class="card">
          <div class="row" style="justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(45, 41, 56, 0.05); padding-bottom: 8px; margin-bottom: 12px; width: 100%;">
            <h2 style="margin: 0; font-size: 15px; font-weight: 900;">🏡 爱心厨房</h2>
            <button class="btn secondary" data-action="go-to-recipe-book" style="min-height: 24px; height: 24px; padding: 0 10px; font-size: 10px; margin: 0; box-shadow: none;">美食库 📖</button>
          </div>
          ${isPaired() ? renderKitchenSection() : '<div class="empty">先去“我的”里完成配对</div>'}
        </section>
      `;
    } else {
      if (isPaired() && !state.voteSession) {
        startVote();
        saveState();
      }
      const session = state.voteSession;
      foodBody = html`
        <section class="card">
          <div class="row" style="justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(45, 41, 56, 0.05); padding-bottom: 8px; margin-bottom: 12px; width: 100%;">
            <h2 style="margin: 0; font-size: 15px; font-weight: 900;">🍕 今天一起吃什么</h2>
            <button class="btn secondary" data-action="go-to-recipe-book" style="min-height: 24px; height: 24px; padding: 0 10px; font-size: 10px; margin: 0; box-shadow: none;">美食库 📖</button>
          </div>
          ${isPaired() ? renderVoteSession(session) : '<div class="empty">先去“我的”里完成配对</div>'}
        </section>

        ${session && session.lockedFood ? html`
          <section class="card result-card text-center" style="border: 2px dashed rgba(124,105,201,0.2); background: #FFFDFD;">
            <div class="result-title" style="color: var(--muted); font-size: 13px; font-weight: 700;">🎯 最终锁定！我们今天吃：</div>
            <div class="result-name" style="font-size: 28px; font-weight: 900; color: var(--rose); margin: 12px 0;">${session.lockedFood.name}</div>
            <div class="text-muted" style="margin-bottom: 12px; font-size: 12px;">${escapeText(session.reason)}</div>
            <div class="row" style="gap: 8px; width: 100%; display: flex;">
              <button class="btn" data-action="kitchen-to-date" data-dish="${escapeText(session.lockedFood.name)}" style="flex: 1; margin:0; min-height: 38px; height: 38px; font-size: 12px;">📌 提为今日去哪玩</button>
              <button class="btn secondary" data-action="start-vote" style="flex: 1; margin:0; min-height: 38px; height: 38px; font-size: 12px; box-shadow: none;">重新发起</button>
            </div>
          </section>
        ` : ''}
      `;
    }

    return html`
      <!-- 就餐模式选择 (在家吃 vs 出去吃) -->
      <div class="eat-mode-switcher card flex-row" style="background-color: var(--rose-soft); border-radius: 999px; padding: 6px; display: flex; margin-bottom: 16px; border: 1px solid rgba(45, 41, 56, 0.04);">
        <button class="eat-mode-item ${eatMode === 'home' ? 'eat-mode-active' : ''}" data-action="switch-eat-mode" data-mode="home" style="flex: 1; border: 0; background: transparent; color: var(--muted); padding: 10px 0; border-radius: 999px; font-weight: 700; transition: all 0.2s ease;">🏡 在家吃</button>
        <button class="eat-mode-item ${eatMode === 'out' ? 'eat-mode-active' : ''}" data-action="switch-eat-mode" data-mode="out" style="flex: 1; border: 0; background: transparent; color: var(--muted); padding: 10px 0; border-radius: 999px; font-weight: 700; transition: all 0.2s ease;">🚗 出去吃</button>
      </div>

      ${foodBody}
    `;
  }

  function renderRecipeBook() {
    const currentCategory = state.recipeCurrentCategory || 'home';
    const isBatchMode = state.recipeBatchMode || false;
    const selectedIds = state.recipeSelectedIds || [];
    
    const filteredFoods = state.foods.filter(f => {
      const cat = f.category || (f.id <= 3 ? 'home' : 'out');
      return cat === currentCategory;
    });

    return html`
      <!-- 美食相册头部 -->
      <div class="row" style="margin-bottom: 14px; width: 100%;">
        <div class="row" style="gap: 8px;">
          <button class="btn secondary" data-action="go-back-to-food" style="min-height: 28px; height: 28px; padding: 0 10px; font-size: 11px; margin: 0; box-shadow: none; border-radius: 99rpx;">← 返回</button>
          <h2 style="margin: 0; font-size: 18px; font-weight: 900;">📖 美食库</h2>
        </div>
      </div>

      <!-- 分类胶囊 -->
      <div class="eat-mode-switcher card flex-row" style="background-color: var(--rose-soft); border-radius: 999px; padding: 4px; display: flex; margin-bottom: 16px; border: 1px solid rgba(45, 41, 56, 0.04);">
        <button class="eat-mode-item ${currentCategory === 'home' ? 'eat-mode-active' : ''}" data-action="recipe-switch-cat" data-cat="home" style="flex: 1; border: 0; background: transparent; color: var(--muted); padding: 8px 0; border-radius: 999px; font-weight: 700; transition: all 0.2s ease; font-size: 13px;">🍳 爱心私房菜</button>
        <button class="eat-mode-item ${currentCategory === 'out' ? 'eat-mode-active' : ''}" data-action="recipe-switch-cat" data-cat="out" style="flex: 1; border: 0; background: transparent; color: var(--muted); padding: 8px 0; border-radius: 999px; font-weight: 700; transition: all 0.2s ease; font-size: 13px;">🗺️ 风味寻宝图</button>
      </div>

      <!-- 工具栏 -->
      <div class="row" style="gap: 10px; margin-bottom: 16px; width: 100%;">
        <button class="btn ghost" data-action="recipe-modal-show-add" style="flex: 1; min-height: 36px; height: 36px; font-size: 12px; box-shadow: none; border-radius: 10px; border-color: rgba(124, 105, 201, 0.2); color: var(--rose);">➕ 新增美食</button>
        <button class="btn ghost ${isBatchMode ? 'active-red' : ''}" data-action="recipe-toggle-batch" style="flex: 1; min-height: 36px; height: 36px; font-size: 12px; box-shadow: none; border-radius: 10px; ${isBatchMode ? 'background:#FFF5F5; color:#FF4D4F; border-color:#FF4D4F;' : ''}">🗑️ ${isBatchMode ? '取消管理' : '批量管理'}</button>
      </div>

      <!-- 网格相册区域 -->
      <div style="height: calc(100vh - 290px); overflow-y: auto; width: 100%; padding-bottom: 50px; box-sizing: border-box;">
        <div class="h5-recipe-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; width: 100%;">
          ${filteredFoods.map(food => {
            const isSelected = selectedIds.includes(food.id);
            return `
              <div class="h5-recipe-card ${isBatchMode ? 'shaking' : ''}" 
                   data-action="recipe-card-click" 
                   data-id="${food.id}" 
                   style="background: #ffffff; border: 1px solid rgba(45,41,56,0.04); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow); position: relative; cursor: pointer;">
                
                <!-- 批量管理选框 -->
                ${isBatchMode ? `
                  <div class="h5-batch-checkbox ${isSelected ? 'checked' : ''}" 
                       style="position: absolute; top: 8px; left: 8px; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #ffffff; background: ${isSelected ? '#FF4D4F' : 'rgba(45, 41, 56, 0.4)'}; display: flex; align-items: center; justify-content: center; z-index: 5; color: #fff; font-size: 12px; font-weight: bold;">
                    ${isSelected ? '✓' : ''}
                  </div>
                ` : ''}

                <!-- 图片框 (支持点击重新上传文件) -->
                <div class="h5-card-image-box" style="width: 100%; height: 110px; background-color: var(--bg); position: relative; border-bottom: 1px solid rgba(45,41,56,0.03);">
                  <label style="cursor: ${isBatchMode ? 'default' : 'pointer'}; display: block; height: 100%; width: 100%;">
                    ${food.image_url ? `
                      <img src="${food.image_url}" style="width: 100%; height: 100%; object-fit: cover;" />
                    ` : `
                      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                        <span style="font-size: 24px;">🍲</span>
                        <span style="font-size: 10px; color: var(--muted); margin-top: 4px;">点击上传美照</span>
                      </div>
                    `}
                    ${!isBatchMode ? `<input type="file" accept="image/*" class="recipe-img-uploader" data-id="${food.id}" style="display: none;" />` : ''}
                  </label>
                </div>

                <!-- 信息区 -->
                <div style="padding: 8px 10px;">
                  <div style="font-size: 13px; font-weight: 800; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;">${escapeText(food.name)}</div>
                  <div style="font-size: 10px; color: var(--rose); background: var(--rose-soft); padding: 1px 6px; border-radius: 4px; display: inline-block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeText(food.tags || '点击修改')}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${filteredFoods.length === 0 ? `
          <div style="text-align: center; padding-top: 60px;">
            <div style="font-size: 40px; margin-bottom: 10px;">📖</div>
            <div style="font-size: 14px; font-weight: bold; color: var(--ink);">美食书还是空荡荡的</div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">开启属于你们的爱心菜谱回忆吧</div>
          </div>
        ` : ''}
      </div>

      <!-- 底部批量删除条 -->
      ${isBatchMode && selectedIds.length > 0 ? html`
        <div class="row" style="position: absolute; left: 16px; right: 16px; bottom: 84px; background: rgba(255, 255, 255, 0.94); backdrop-filter: blur(10px); border: 1px solid rgba(255, 77, 79, 0.12); box-shadow: 0 4px 20px rgba(255, 77, 79, 0.08); border-radius: 99rpx; padding: 8px 12px 8px 18px; justify-content: space-between; z-index: 10; animation: slideUpCart 0.2s ease;">
          <span style="font-size: 12px; font-weight: 800; color: var(--ink);">已选择 <strong style="color: #FF4D4F; font-size: 14px;">${selectedIds.length}</strong> 道美食</span>
          <button class="btn" data-action="recipe-batch-delete-confirm" style="background: #FF4D4F; min-height: 28px; height: 28px; padding: 0 16px; font-size: 11px; margin: 0; box-shadow: none;">❌ 批量删除</button>
        </div>
      ` : ''}

      <!-- H5 新增/编辑弹窗 -->
      ${state.showRecipeModal ? html`
        <div class="order-confirm-modal" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(45, 41, 56, 0.5); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: flex-end;">
          <div class="modal-content" style="background: #ffffff; border-radius: 16px 16px 0 0; width: 100%; padding: 18px; box-shadow: 0 -4px 20px rgba(0,0,0,0.06); box-sizing: border-box;">
            <div class="row" style="margin-bottom: 14px; width: 100%;">
              <h3 style="margin: 0; font-weight: 900; font-size: 15px; color: var(--ink);">${state.recipeEditMode ? '📝 编辑美食信息' : '➕ 新增爱心美食'}</h3>
              <span data-action="recipe-modal-hide" style="font-size: 22px; cursor: pointer; color: var(--muted); line-height: 1;">×</span>
            </div>
            <div class="stack" style="width: 100%; gap: 12px; margin-bottom: 14px;">
              <div>
                <label style="font-size: 11px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 4px;">美食名称</label>
                <input id="recipeFormName" class="input" placeholder="输入美味名称 (如: 咖喱餐)" value="${escapeText(state.recipeFormName || '')}" />
              </div>
              <div>
                <label style="font-size: 11px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 4px;">美食标签 (逗号分隔)</label>
                <input id="recipeFormTags" class="input" placeholder="输入美食特点 (如: 热腾腾,超辣)" value="${escapeText(state.recipeFormTags || '')}" />
              </div>
              <div>
                <label style="font-size: 11px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 4px;">就餐品类分类</label>
                <div class="row" style="justify-content: flex-start; gap: 20px; padding: 4px 0;">
                  <label style="font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                    <input type="radio" name="h5RecipeCat" value="home" ${state.recipeFormCategory === 'home' ? 'checked' : ''} /> 🏡 私房菜
                  </label>
                  <label style="font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                    <input type="radio" name="h5RecipeCat" value="out" ${state.recipeFormCategory === 'out' ? 'checked' : ''} /> 🚗 寻宝图
                  </label>
                </div>
              </div>
            </div>
            <div class="row" style="gap: 8px; width: 100%;">
              <button class="btn secondary" data-action="recipe-modal-hide" style="flex: 1; margin:0; min-height: 38px; height: 38px; font-size: 12px; box-shadow: none;">取消</button>
              <button class="btn" data-action="recipe-modal-submit" style="flex: 1; margin:0; min-height: 38px; height: 38px; font-size: 12px;">确认保存</button>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }

  function renderVoteSession(session) {
    const outFoods = state.foods.filter(food => food.category === 'out');

    if (!session) {
      startVote();
      saveState();
      session = state.voteSession;
    }

    if (session.lockedFood) {
      return `<div class="list-item"><strong>最终锁定：${escapeText(session.lockedFood.name)}</strong><p class="muted">${escapeText(session.reason)}</p></div><button class="btn secondary" data-action="start-vote">重新发起</button>`;
    }

    return html`
      <p class="muted">悄悄选 1 到 3 个想吃的，美食重合就直接锁定。</p>
      <div class="food-grid">
        ${outFoods.map(food => `<button class="food-chip ${selectedVotes.includes(food.id) ? 'selected' : ''}" data-action="toggle-vote" data-id="${food.id}">${escapeText(food.name)}</button>`).join('') || '<div class="empty">美食库还没有出去吃选项</div>'}
      </div>
      <div class="row" style="gap: 8px; width: 100%; display: flex; margin-top: 12px;">
        <button class="btn secondary" data-action="random-vote" ${outFoods.length ? '' : 'disabled'} style="flex: 1; min-height: 38px; height: 38px; font-size: 12px; box-shadow: none;">随机选择</button>
        <button class="btn" data-action="submit-vote" ${selectedVotes.length ? '' : 'disabled'} style="flex: 1; min-height: 38px; height: 38px; font-size: 12px;">提交选择</button>
      </div>
    `;
  }

  function renderDate() {
    return html`
      <section class="card stack" style="gap: 10px;">
        <h2 style="font-size: 15px; margin: 0 0 4px;">发起去哪玩提案</h2>
        <input id="dateTitle" class="input" placeholder="主题：想去干嘛 (如看电影/吃火锅)" />
        <div class="form-grid">
          <input id="dateDay" class="input" type="date" value="${today()}" />
          <input id="dateTime" class="input" type="time" value="18:00" />
        </div>
        <input id="dateLocation" class="input" placeholder="📍 地点：在哪个地标见面 (选填)" />
        <input id="dateNotes" class="input" placeholder="📝 备注：补充说明 (选填)" />
        <button class="btn" data-action="add-date">发送去哪玩提案</button>
      </section>

      <section class="card">
        <h2>去哪玩记录</h2>
        <div class="list">
          ${state.datePlans.map(plan => renderPlan(plan)).join('') || '<div class="empty">还没有去哪玩记录</div>'}
        </div>
      </section>

      <section class="card">
        <h2>想去的地方</h2>
        <div class="row">
          <input id="wishName" class="input" placeholder="输入愿望地点" />
          <button class="btn" data-action="add-wish">添加</button>
        </div>
        <div class="list" style="margin-top: 12px;">
          ${state.wishlist.map(wish => `<div class="list-item row"><strong>${escapeText(wish.name)}</strong><button class="btn ghost" data-action="wish-to-date" data-name="${escapeText(wish.name)}">提为行程</button></div>`).join('')}
        </div>
      </section>
    `;
  }

  function renderPlan(plan) {
    const statusText = {
      pending: '待确认',
      accepted: '已同意',
      rejected: '已婉拒',
      revision_requested: '修改建议中'
    }[plan.status];

    const actions = plan.status === 'pending' && plan.createdBy !== state.user.id
      ? `<div class="row date-actions"><button class="btn mint" data-action="accept-date" data-id="${plan.id}">接受</button><button class="btn sun" data-action="revise-date" data-id="${plan.id}">修改建议</button><button class="btn secondary" data-action="reject-date" data-id="${plan.id}">婉拒</button></div>`
      : `<button class="btn ghost" data-action="delete-date" data-id="${plan.id}">删除</button>`;

    return html`
      <div class="card date-plan-card date-card-${plan.status}">
        <div class="date-header row">
          <span class="pill status-${plan.status}">${statusText}</span>
          <span class="date-time-tag">${escapeText(plan.time)}</span>
        </div>
        <div class="date-title">📌 ${escapeText(plan.title)}</div>
        ${plan.location ? `<p class="date-detail">📍 地点：${escapeText(plan.location)}</p>` : ''}
        ${plan.notes ? `<p class="date-detail">📝 备注：${escapeText(plan.notes)}</p>` : ''}
        ${plan.revision ? `<div class="revision-note-box"><span class="revision-label">💡 对方修改建议：</span><span class="revision-content">${escapeText(plan.revision)}</span></div>` : ''}
        ${actions}
      </div>
    `;
  }

  function renderProfile() {
    return html`
      <section class="card">
        <div class="row">
          <div>
            <p class="eyebrow">Profile</p>
            <h2>${escapeText(state.user.nickname)}</h2>
            <p class="muted">我的配对码：${escapeText(state.user.pairCode)}</p>
          </div>
          <span class="pill">${isPaired() ? '已配对' : '未配对'}</span>
        </div>
      </section>

      <section class="metric">
        <div class="metric-item"><span class="metric-number">${daysTogether()}</span><span class="muted">相伴天数</span></div>
        <div class="metric-item"><span class="metric-number">${state.foods.length}</span><span class="muted">美食库存</span></div>
        <div class="metric-item"><span class="metric-number">${state.datePlans.length}</span><span class="muted">去哪玩记录</span></div>
      </section>

      <section class="card stack">
        <h2>用户配对</h2>
        ${isPaired() ? `<div class="list-item"><strong>已和 ${escapeText(state.partner.nickname)} 配对</strong><p class="muted">可以体验一起选菜和去哪玩流转。</p></div><button class="btn secondary" data-action="unpair">解除绑定</button>` : `<p class="muted">输入伴侣配对码体验配对：TA520</p><div class="row"><input id="pairCode" class="input" placeholder="输入配对码" /><button class="btn" data-action="pair">配对</button></div>`}
      </section>

      <section class="card stack">
        <h2>重要日子</h2>
        <input id="annTitle" class="input" placeholder="纪念日名称" />
        <div class="form-grid">
          <input id="annDate" class="input" type="date" value="${today()}" />
          <button class="btn" data-action="add-anniversary">保存</button>
        </div>
        <div class="list">
          ${state.anniversaries.map(item => `<div class="list-item row"><div><strong>${escapeText(item.title)}</strong><p class="muted">${escapeText(item.date)} ${item.yearly ? '每年重复' : '单次'}</p></div><button class="btn ghost" data-action="delete-anniversary" data-id="${item.id}">删除</button></div>`).join('')}
        </div>
      </section>
    `;
  }

  function render() {
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === activeView));
    const views = {
      home: renderHome,
      food: renderFood,
      date: renderDate,
      profile: renderProfile,
      recipe: renderRecipeBook
    };

    // 动态管理顶部导航栏标题和展示
    const appHeader = document.querySelector('.app-header');
    const headerTitle = document.querySelector('#appHeaderTitle');
    if (appHeader && headerTitle) {
      if (activeView === 'profile' || activeView === 'recipe') {
        appHeader.style.display = 'none';
      } else {
        appHeader.style.display = 'flex';
        if (headerRecipeBtn) {
          headerRecipeBtn.style.display = 'none';
        }
        if (activeView === 'home') {
          headerTitle.textContent = '我们的日常';
        } else if (activeView === 'food') {
          headerTitle.textContent = '我们吃什么';
        } else if (activeView === 'date') {
          headerTitle.textContent = '我们去哪玩';
        }
      }
    }

    view.innerHTML = views[activeView]();
  }

  function toast(message) {
    window.alert(message);
  }

  function setView(nextView) {
    activeView = nextView;
    render();
  }

  function handleAction(action, target) {
    if (action === 'spin') spinWheel();
    if (action === 'lock-wheel') lockWheel();
    if (action === 'go-to-recipe-book') {
      state.recipeBatchMode = false;
      state.recipeSelectedIds = [];
      setView('recipe');
    }
    if (action === 'go-back-to-food') {
      setView('food');
    }
    if (action === 'recipe-switch-cat') {
      state.recipeCurrentCategory = target.dataset.cat;
      state.recipeSelectedIds = [];
      state.recipeBatchMode = false;
    }
    if (action === 'recipe-toggle-batch') {
      state.recipeBatchMode = !state.recipeBatchMode;
      state.recipeSelectedIds = [];
    }
    if (action === 'recipe-card-click') {
      const id = Number(target.dataset.id);
      if (state.recipeBatchMode) {
        const idx = state.recipeSelectedIds.indexOf(id);
        if (idx > -1) {
          state.recipeSelectedIds.splice(idx, 1);
        } else {
          state.recipeSelectedIds.push(id);
        }
      } else {
        const food = state.foods.find(f => f.id === id);
        if (food) {
          state.showRecipeModal = true;
          state.recipeEditMode = true;
          state.recipeFormId = id;
          state.recipeFormName = food.name;
          state.recipeFormTags = food.tags || '';
          state.recipeFormCategory = food.category || 'home';
        }
      }
    }
    if (action === 'recipe-modal-show-add') {
      state.showRecipeModal = true;
      state.recipeEditMode = false;
      state.recipeFormId = null;
      state.recipeFormName = '';
      state.recipeFormTags = '';
      state.recipeFormCategory = state.recipeCurrentCategory;
    }
    if (action === 'recipe-modal-hide') {
      state.showRecipeModal = false;
    }
    if (action === 'recipe-modal-submit') {
      submitH5RecipeForm();
    }
    if (action === 'recipe-batch-delete-confirm') {
      deleteSelectedH5Recipes();
    }
    if (action === 'cal-toggle') {
      state.calendarExpanded = !state.calendarExpanded;
      saveState();
      render();
    }
    if (action === 'cal-prev-month') {
      if (state.calendarMonth === 1) {
        state.calendarYear -= 1;
        state.calendarMonth = 12;
      } else {
        state.calendarMonth -= 1;
      }
      saveState();
      render();
    }
    if (action === 'cal-next-month') {
      if (state.calendarMonth === 12) {
        state.calendarYear += 1;
        state.calendarMonth = 1;
      } else {
        state.calendarMonth += 1;
      }
      saveState();
      render();
    }
    if (action === 'cal-back-today') {
      state.calendarYear = new Date().getFullYear();
      state.calendarMonth = new Date().getMonth() + 1;
      state.calendarSelectedDateStr = today();
      saveState();
      render();
    }
    if (action === 'cal-select-day') {
      state.calendarSelectedDateStr = target.dataset.date;
      saveState();
      render();
    }
    if (action === 'cal-show-add-dialog') {
      state.showCalendarCustomDialog = true;
      saveState();
      render();
    }
    if (action === 'cal-hide-add-dialog') {
      state.showCalendarCustomDialog = false;
      saveState();
      render();
    }
    if (action === 'cal-submit-custom') {
      const textInput = document.querySelector('#calCustomText');
      const timeInput = document.querySelector('#calCustomTime');
      const title = textInput ? textInput.value.trim() : '';
      const time = timeInput ? timeInput.value : '';
      if (!title) return toast('请输入备忘内容哦');
      state.calendarCustomEvents.push({
        id: Date.now(),
        title,
        event_date: state.calendarSelectedDateStr,
        event_time: time || null
      });
      state.showCalendarCustomDialog = false;
      saveState();
      render();
      toast('备忘保存成功！');
    }
    if (action === 'cal-delete-custom') {
      const id = Number(target.dataset.id);
      if (window.confirm('确定要删除这条日程备忘吗？')) {
        state.calendarCustomEvents = state.calendarCustomEvents.filter(item => item.id !== id);
        saveState();
        render();
        toast('备忘已删除');
      }
    }
    if (action === 'switch-eat-mode') {
      state.eatMode = target.dataset.mode;
    }
    if (action === 'kitchen-to-date') {
      convertToH5DatePlan(target.dataset.dish);
    }
    if (action === 'kitchen-select-cat') {
      state.activeCategory = target.dataset.cat;
    }
    if (action === 'kitchen-cart-change') {
      changeH5Cart(Number(target.dataset.id), target.dataset.type);
    }
    if (action === 'kitchen-checkout-show') {
      state.showConfirmModal = true;
    }
    if (action === 'kitchen-checkout-hide') {
      state.showConfirmModal = false;
    }
    if (action === 'kitchen-cart-order-submit') {
      submitH5CartOrder();
    }
    if (action === 'kitchen-cancel') cancelKitchenOrder();
    if (action === 'kitchen-accept') acceptKitchenCook();
    if (action === 'kitchen-serve') serveKitchenCook();
    if (action === 'kitchen-praise') praiseKitchenCook();
    if (action === 'kitchen-reset') resetKitchenCook();
    if (action === 'start-vote') startVote();
    if (action === 'toggle-vote') toggleVote(Number(target.dataset.id));
    if (action === 'random-vote') randomVote();
    if (action === 'submit-vote') submitVote();
    if (action === 'add-date') addDate();
    if (action === 'accept-date') updateDate(Number(target.dataset.id), 'accepted');
    if (action === 'reject-date') updateDate(Number(target.dataset.id), 'rejected');
    if (action === 'revise-date') reviseDate(Number(target.dataset.id));
    if (action === 'delete-date') deleteDate(Number(target.dataset.id));
    if (action === 'add-wish') addWish();
    if (action === 'wish-to-date') wishToDate(target.dataset.name);
    if (action === 'pair') pair();
    if (action === 'unpair') unpair();
    if (action === 'add-anniversary') addAnniversary();
    if (action === 'delete-anniversary') deleteAnniversary(Number(target.dataset.id));
    saveState();
    render();
  }

  function spinWheel() {
    const outFoods = state.foods.filter(f => f.category === 'out');
    if (outFoods.length === 0) return toast('请先在美食书中添加出去吃的美食哦');
    const food = outFoods[Math.floor(Math.random() * outFoods.length)];
    state.todayFood = { ...food, reason: '轮盘抽取' };
    wheelRotation += 720 + Math.floor(Math.random() * 360);
  }

  function lockWheel() {
    if (!state.todayFood) spinWheel();
    if (!state.todayFood) return;
    state.todayFood.reason = '今日锁定';
    toast(`已锁定：${state.todayFood.name}`);
  }

  function submitH5RecipeForm() {
    const nameInput = document.querySelector('#recipeFormName');
    const tagsInput = document.querySelector('#recipeFormTags');
    const name = nameInput ? nameInput.value.trim() : '';
    const tags = tagsInput ? tagsInput.value.trim() : '';
    const catInput = document.querySelector('input[name="h5RecipeCat"]:checked');
    const category = catInput ? catInput.value : 'home';

    if (!name) return toast('请输入美食名称哦');

    if (state.recipeEditMode) {
      // Edit
      const food = state.foods.find(f => f.id === state.recipeFormId);
      if (food) {
        food.name = name;
        food.tags = tags;
        food.category = category;
      }
    } else {
      // Add
      const newFood = {
        id: nextId(state.foods),
        name,
        tags,
        category,
        image_url: ''
      };
      state.foods.unshift(newFood);
    }
    state.showRecipeModal = false;
    saveState();
    render();
    toast('保存成功');
  }

  function deleteSelectedH5Recipes() {
    const selectedIds = state.recipeSelectedIds || [];
    if (selectedIds.length === 0) return;
    
    if (window.confirm(`确定要批量删除选中的 ${selectedIds.length} 道美食吗？`)) {
      state.foods = state.foods.filter(f => !selectedIds.includes(f.id));
      state.recipeSelectedIds = [];
      state.recipeBatchMode = false;
      saveState();
      render();
      toast('删除成功');
    }
  }

  function startVote() {
    selectedVotes = [];
    state.voteSession = { statusText: '投票进行中', lockedFood: null, reason: '' };
  }

  function toggleVote(id) {
    if (selectedVotes.includes(id)) {
      selectedVotes = selectedVotes.filter(item => item !== id);
    } else if (selectedVotes.length < 3) {
      selectedVotes.push(id);
    }
  }

  function randomVote() {
    const outFoods = state.foods.filter(food => food.category === 'out');
    if (!outFoods.length) return toast('美食库还没有出去吃选项');

    const shuffled = [...outFoods].sort(() => Math.random() - 0.5);
    selectedVotes = shuffled.slice(0, Math.min(3, shuffled.length)).map(food => food.id);
  }

  function submitVote() {
    if (!selectedVotes.length) return;
    const selected = state.foods.find(food => food.id === selectedVotes[0]);
    state.voteSession = {
      statusText: '已锁定',
      lockedFood: selected,
      reason: 'H5 预览中模拟伴侣选择，直接锁定第一个重合项'
    };
    state.todayFood = { ...selected, reason: '双人盲盒' };
  }

  function addDate() {
    const title = document.querySelector('#dateTitle').value.trim();
    if (!title) return;
    state.datePlans.unshift({
      id: nextId(state.datePlans),
      title,
      time: `${document.querySelector('#dateDay').value} ${document.querySelector('#dateTime').value}`,
      location: document.querySelector('#dateLocation').value.trim(),
      notes: document.querySelector('#dateNotes').value.trim(),
      status: 'pending',
      revision: '',
      createdBy: state.user.id
    });
  }

  function updateDate(id, status) {
    const plan = state.datePlans.find(item => item.id === id);
    if (plan) plan.status = status;
  }

  function reviseDate(id) {
    const plan = state.datePlans.find(item => item.id === id);
    if (!plan) return;
    const note = window.prompt('输入修改建议', '改到 19:00 好不好？');
    if (note) {
      plan.status = 'revision_requested';
      plan.revision = note;
    }
  }

  function deleteDate(id) {
    state.datePlans = state.datePlans.filter(item => item.id !== id);
  }

  function addWish() {
    const input = document.querySelector('#wishName');
    const name = input.value.trim();
    if (!name) return;
    state.wishlist.unshift({ id: nextId(state.wishlist), name });
  }

  function wishToDate(name) {
    state.datePlans.unshift({
      id: nextId(state.datePlans),
      title: `去打卡「${name}」`,
      time: `${today()} 18:00`,
      location: '',
      notes: '由愿望单生成',
      status: 'pending',
      revision: '',
      createdBy: state.user.id
    });
    activeView = 'date';
  }

  function pair() {
    const code = document.querySelector('#pairCode').value.trim().toUpperCase();
    if (code !== state.partner.pairCode) return toast('配对码不正确，试试 TA520');
    state.user.partnerId = state.partner.id;
    state.partner.partnerId = state.user.id;
  }

  function unpair() {
    state.user.partnerId = null;
    state.partner.partnerId = null;
  }

  function addAnniversary() {
    const title = document.querySelector('#annTitle').value.trim();
    if (!title) return;
    state.anniversaries.unshift({
      id: nextId(state.anniversaries),
      title,
      date: document.querySelector('#annDate').value,
      yearly: true
    });
  }

  function deleteAnniversary(id) {
    state.anniversaries = state.anniversaries.filter(item => item.id !== id);
  }

  function getKitchenStatusText(status) {
    return {
      ordered: '已下单',
      cooking: '掌勺中',
      served: '已装盘',
      eaten: '吃饱啦'
    }[status] || '空闲';
  }

  function renderKitchenSection() {
    const session = state.kitchenSession;
    if (!session) {
      const activeCategory = state.activeCategory || 'signature';
      const cart = state.cart || {};
      const cartCount = Object.values(cart).reduce((sum, q) => sum + q, 0);
      
      const filteredDishes = state.foods.filter(food => getDishCategory(food) === activeCategory);
      
      const categories = [
        { key: 'signature', name: '⭐ 拿手菜' },
        { key: 'hot', name: '🍲 热腾腾' },
        { key: 'soup', name: '🥣 靓汤水' },
        { key: 'staple', name: '🍚 主食面' },
        { key: 'others', name: '💡 随便吃' }
      ];

      return html`
        <p class="muted">大厨已就位，请挑选想吃的美味订单 🍽️</p>
        
        <!-- 双栏容器 -->
        <div class="meituan-container" style="display: flex; height: 280px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-bottom: 12px;">
          <!-- 左栏：侧边栏分类 -->
          <div class="menu-sidebar" style="width: 80px; background-color: var(--bg); height: 100%; border-right: 1px solid var(--line); overflow-y: auto;">
            ${categories.map(cat => `
              <div class="sidebar-item ${activeCategory === cat.key ? 'sidebar-active' : ''}" 
                   data-action="kitchen-select-cat" 
                   data-cat="${cat.key}" 
                   style="padding: 12px 6px; font-size: 11px; text-align: center; font-weight: 700; cursor: pointer; border-left: 3px solid transparent; color: ${activeCategory === cat.key ? 'var(--rose)' : 'var(--muted)'}; background-color: ${activeCategory === cat.key ? '#ffffff' : 'transparent'}; border-left-color: ${activeCategory === cat.key ? 'var(--rose)' : 'transparent'};">
                ${cat.name}
              </div>
            `).join('')}
          </div>

          <!-- 右栏：菜品展示 -->
          <div class="menu-content" style="flex: 1; padding: 12px; height: 100%; overflow-y: auto; background-color: #ffffff;">
            ${filteredDishes.map(food => {
              const qty = cart[food.id] || 0;
              return `
                <div class="menu-dish-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(45,41,56,0.04);">
                  <div class="dish-info" style="flex: 1; padding-right: 10px;">
                    <div style="font-size: 13px; font-weight: bold; color: var(--ink);">${escapeText(food.name)}</div>
                    <div style="font-size: 10px; color: var(--muted); margin-top: 2px;">${escapeText(food.tags || '主厨特制，美味可口')}</div>
                  </div>
                  <!-- 加减按钮 -->
                  <div class="dish-action" style="display: flex; align-items: center; gap: 8px;">
                    ${qty > 0 ? `
                      <button class="circle-btn" data-action="kitchen-cart-change" data-id="${food.id}" data-type="minus" style="width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--rose); color: var(--rose); background: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; padding: 0;">-</button>
                      <span style="font-size: 13px; font-weight: 800; color: var(--ink); min-width: 12px; text-align: center;">${qty}</span>
                    ` : ''}
                    <button class="circle-btn" data-action="kitchen-cart-change" data-id="${food.id}" data-type="plus" style="width: 22px; height: 22px; border-radius: 50%; border: 0; background: var(--rose); color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; padding: 0;">+</button>
                  </div>
                </div>
              `;
            }).join('')}
            ${filteredDishes.length === 0 ? '<div style="font-size:11px; color:var(--muted); text-align:center; padding-top:40px;">暂无该品类美食</div>' : ''}
          </div>
        </div>

        <!-- 底部结算栏 -->
        ${cartCount > 0 ? html`
          <div class="menu-cart-bar row" style="background: var(--bg); padding: 10px 14px; border-radius: 10px; border: 1px solid var(--line); margin-bottom: 12px;">
            <div class="row" style="gap: 8px;">
              <span style="font-size: 20px;">🛒</span>
              <span style="font-size: 13px; font-weight: 800;">已挑 ${cartCount} 道美味</span>
            </div>
            <button class="btn" data-action="kitchen-checkout-show" style="min-height: 32px; height: 32px; padding: 0 16px; font-size: 12px; margin: 0; box-shadow: none;">去下单</button>
          </div>
        ` : ''}

        <!-- H5 订单确认弹层 -->
        ${state.showConfirmModal ? html`
          <div class="order-confirm-modal" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(45, 41, 56, 0.5); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: flex-end;">
            <div class="modal-content" style="background: #ffffff; border-radius: 16px 16px 0 0; width: 100%; padding: 18px; box-shadow: 0 -4px 20px rgba(0,0,0,0.06); box-sizing: border-box;">
              <div class="row" style="margin-bottom: 14px; width: 100%;">
                <h3 style="margin: 0; font-weight: 900; font-size: 15px; color: var(--ink);">🍜 确认您的爱心菜单</h3>
                <span data-action="kitchen-checkout-hide" style="font-size: 22px; cursor: pointer; color: var(--muted); line-height: 1;">×</span>
              </div>
              <div style="max-height: 120px; overflow-y: auto; margin-bottom: 14px; border-bottom: 1px solid var(--line); width: 100%;">
                ${Object.keys(cart).map(idKey => {
                  const food = state.foods.find(f => f.id === Number(idKey));
                  if (!food) return '';
                  return `
                    <div class="row" style="padding: 8px 0; font-size: 13px; width: 100%;">
                      <strong>🍜 ${escapeText(food.name)}</strong>
                      <span style="color: var(--rose); font-weight: 800;">x${cart[idKey]}</span>
                    </div>
                  `;
                }).join('')}
              </div>
              <div class="stack" style="width: 100%;">
                <input id="h5KitchenDinerNote" class="input" placeholder="点单小备注 (如: 少放辣)" />
                <button class="btn" data-action="kitchen-cart-order-submit" style="width: 100%;">确认发送给大厨 🍳</button>
              </div>
            </div>
          </div>
        ` : ''}
      `;
    }

    if (session.status === 'ordered') {
      if (session.diner_id === state.user.id) {
        return html`
          <div class="list-item" style="border-left: 5px solid var(--sun); display: block;">
            <strong>🍜 点菜：${escapeText(session.dish_name)}</strong>
            <p class="muted" style="margin: 4px 0 0;">食客要求：${session.diner_note ? escapeText(session.diner_note) : '无'}</p>
          </div>
          <p class="muted" style="margin-top: 12px; text-align: center;">⌛ 订单已发送，等待宝贝接单下厨...</p>
          <button class="btn secondary" data-action="kitchen-cancel" style="margin-top: 12px; width: 100%;">取消点单</button>
        `;
      } else {
        return html`
          <div class="list-item" style="border-left: 5px solid var(--sun); display: block;">
            <strong>🍜 伴侣点菜：${escapeText(session.dish_name)}</strong>
            <p class="muted" style="margin: 4px 0 0;">食客要求：${session.diner_note ? escapeText(session.diner_note) : '无'}</p>
          </div>
          <div class="row" style="margin-top: 12px; gap: 8px; width: 100%;">
            <button class="btn" data-action="kitchen-accept" style="flex: 1; margin:0;">🍳 掌勺接单</button>
            <button class="btn secondary" data-action="kitchen-cancel" style="flex: 1; margin:0;">婉拒</button>
          </div>
        `;
      }
    }

    if (session.status === 'cooking') {
      if (session.diner_id === state.user.id) {
        return html`
          <div class="list-item" style="border-left: 5px solid var(--rose); display: block;">
            <strong>🔥 宝贝掌勺中：${escapeText(session.dish_name)}</strong>
            <p class="muted" style="margin: 4px 0 0;">伴侣正在厨房为您忙碌烹饪，静候起锅...</p>
          </div>
        `;
      } else {
        return html`
          <div class="list-item" style="border-left: 5px solid var(--rose); display: block;">
            <strong>🔥 下厨烹饪：${escapeText(session.dish_name)}</strong>
            <p class="muted" style="margin: 4px 0 0;">要求：${session.diner_note ? escapeText(session.diner_note) : '无'}</p>
          </div>
          <div class="stack" style="margin-top: 12px;">
            <input id="kitchenChefNote" class="input" placeholder="给宝贝捎句话..." />
            
            <label class="btn secondary" style="cursor: pointer; margin-top: 8px; width: 100%;">
              📸 ${state.cookedDishPhotoTemp ? '已选择菜肴照片' : '上传美味照片(模拟拍照)'}
              <input type="file" id="kitchenPhotoInput" accept="image/*" style="display: none;" />
            </label>
            ${state.cookedDishPhotoTemp ? `<img src="${state.cookedDishPhotoTemp}" style="width: 100%; height: 160px; object-fit: cover; border-radius: 8px; margin-top: 8px;" />` : ''}

            <button class="btn" data-action="kitchen-serve" style="margin-top: 8px;">🍲 起锅装盘送上桌</button>
          </div>
        `;
      }
    }

    if (session.status === 'served') {
      if (session.diner_id === state.user.id) {
        return html`
          <div class="list-item" style="border-left: 5px solid var(--mint); display: block;">
            <strong>🍲 菜肴：${escapeText(session.dish_name)}</strong>
            ${session.chef_note ? `<p style="margin: 8px 0; padding-left: 8px; border-left: 3px solid var(--rose); font-style: italic;">“ ${escapeText(session.chef_note)} ”</p>` : ''}
          </div>
          ${session.image_url ? `<img src="${session.image_url}" style="width: 100%; height: 180px; object-fit: cover; border-radius: 8px; margin: 12px 0;" />` : ''}
          <div class="stack" style="margin-top: 12px;">
            <input id="kitchenPraise" class="input" placeholder="简直是人间美味！宝贝太棒啦❤️" />
            <button class="btn" data-action="kitchen-praise">😋 吃饱啦，送上爱心好评</button>
          </div>
        `;
      } else {
        return html`
          <div class="list-item" style="border-left: 5px solid var(--mint); display: block;">
            <strong>🍲 菜名：${escapeText(session.dish_name)}</strong>
            <p class="muted" style="margin: 4px 0 0;">已装盘上桌，静候宝贝品尝评价... ❤️</p>
          </div>
        `;
      }
    }

    if (session.status === 'eaten') {
      return html`
        <div class="list-item" style="border-left: 5px solid var(--mint); display: block;">
          <strong>🏅 宝贝的评价反馈：</strong>
          <p style="margin: 8px 0; padding-left: 8px; border-left: 3px solid var(--mint); font-weight: bold; color: var(--mint);">“ ${escapeText(session.praise || '大吃一饱！大厨辛苦了！')} ”</p>
        </div>
        <button class="btn" data-action="kitchen-reset" style="margin-top: 12px; width: 100%;">开启下一顿美味 🍳</button>
      `;
    }

    return '';
  }

  function selectKitchenDish(name) {
    const input = document.querySelector('#kitchenDishName');
    if (input) input.value = name;
  }

  function orderKitchenDish() {
    const dishName = document.querySelector('#kitchenDishName').value.trim();
    const dinerNote = document.querySelector('#kitchenDinerNote').value.trim();
    if (!dishName) return toast('请输入或选择菜名');
    state.kitchenSession = {
      id: nextId(state.foods) + 100,
      dish_name: dishName,
      diner_id: state.user.id,
      chef_id: state.partner.id,
      diner_note: dinerNote,
      status: 'ordered',
      chef_note: '',
      image_url: '',
      praise: '',
      created_at: nowIso()
    };
    autoSimulateH5Cooking();
  }

  function cancelKitchenOrder() {
    state.kitchenSession = null;
  }

  function acceptKitchenCook() {
    if (state.kitchenSession) state.kitchenSession.status = 'cooking';
  }

  function serveKitchenCook() {
    const chefNote = document.querySelector('#kitchenChefNote').value.trim();
    state.kitchenSession = {
      ...state.kitchenSession,
      status: 'served',
      chef_note: chefNote || '大功告成，爱心餐点出锅啦！',
      image_url: state.cookedDishPhotoTemp || ''
    };
    state.cookedDishPhotoTemp = null;
    autoSimulateH5Eating();
  }

  function praiseKitchenCook() {
    const praise = document.querySelector('#kitchenPraise').value.trim();
    state.kitchenSession = {
      ...state.kitchenSession,
      status: 'eaten',
      praise: praise || '简直是人间美味！给你点赞❤️'
    };
  }

  function resetKitchenCook() {
    state.kitchenSession = null;
  }

  function autoSimulateH5Cooking() {
    setTimeout(() => {
      if (state.kitchenSession && state.kitchenSession.status === 'ordered') {
        state.kitchenSession.status = 'cooking';
        saveState();
        render();
        alert('🍳 伴侣已接单！开始在厨房为您忙碌烹饪，请耐心等待。');
      }
    }, 4000);
  }

  function autoSimulateH5Eating() {
    setTimeout(() => {
      if (state.kitchenSession && state.kitchenSession.status === 'served') {
        state.kitchenSession.status = 'eaten';
        state.kitchenSession.praise = '简直是人间美味！宝贝下厨太辛苦啦，给你一百个赞！❤️';
        saveState();
        render();
        alert('😋 伴侣已品尝完毕！并送来了超级好评：“简直是人间美味！宝贝下厨太辛苦啦，给你一百个赞！❤️”');
      }
    }, 4000);
  }

  view.addEventListener('change', event => {
    if (event.target.id === 'kitchenPhotoInput') {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          state.cookedDishPhotoTemp = e.target.result;
          render();
        };
        reader.readAsDataURL(file);
      }
    }
  });

  function getDishCategory(dish) {
    const name = dish.name || '';
    const tags = ((dish.tags || '') + name).toLowerCase();
    if (tags.includes('拿手') || tags.includes('招牌') || tags.includes('推荐') || dish.id <= 3) return 'signature';
    if (tags.includes('汤') || tags.includes('水') || tags.includes('煲')) return 'soup';
    if (tags.includes('面') || tags.includes('饭') || tags.includes('粉') || tags.includes('主食')) return 'staple';
    if (tags.includes('热') || tags.includes('炒') || tags.includes('肉') || tags.includes('辣') || tags.includes('川') || tags.includes('火锅') || tags.includes('烤') || tags.includes('炸') || tags.includes('煮')) return 'hot';
    return 'others';
  }

  function changeH5Cart(dishId, type) {
    if (!state.cart) state.cart = {};
    if (type === 'plus') {
      state.cart[dishId] = (state.cart[dishId] || 0) + 1;
    } else {
      if (state.cart[dishId] > 0) {
        state.cart[dishId]--;
        if (state.cart[dishId] === 0) {
          delete state.cart[dishId];
        }
      }
    }
    saveState();
    render();
  }

  function submitH5CartOrder() {
    const cart = state.cart || {};
    const keys = Object.keys(cart);
    if (keys.length === 0) return;

    const cartItems = keys.map(idKey => {
      const food = state.foods.find(f => f.id === Number(idKey));
      return food ? `${food.name} x${cart[idKey]}` : '';
    }).filter(Boolean);

    const dishName = cartItems.join('、');
    const noteInput = document.querySelector('#h5KitchenDinerNote');
    const dinerNote = noteInput ? noteInput.value.trim() : '';

    state.kitchenSession = {
      id: nextId(state.foods) + 100,
      dish_name: dishName,
      diner_id: state.user.id,
      chef_id: state.partner.id,
      diner_note: dinerNote,
      status: 'ordered',
      chef_note: '',
      image_url: '',
      praise: '',
      created_at: nowIso()
    };
    state.cart = {};
    state.showConfirmModal = false;
    saveState();
    render();
    autoSimulateH5Cooking();
  }

  function convertToH5DatePlan(dish) {
    const title = `💞 吃大餐：${dish} 🍽️`;
    const newPlan = {
      id: nextId(state.datePlans),
      title,
      time: `${today()} 18:00`,
      location: '特色餐馆/待定',
      notes: '由今日美食决策一键联动生成。',
      status: 'accepted',
      revision: '',
      createdBy: state.user.id
    };
    state.datePlans.unshift(newPlan);
    saveState();
    toast(`已成功提为今日去哪玩！正在跳转到去哪玩页面...`);
    setTimeout(() => {
      setView('date');
    }, 800);
  }

  tabs.forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));
  headerRecipeBtn.addEventListener('click', () => handleAction('go-to-recipe-book', headerRecipeBtn));
  resetBtn.addEventListener('click', () => {
    localStorage.removeItem(storageKey);
    state = defaultState();
    selectedVotes = [];
    wheelRotation = 0;
    saveState();
    render();
  });

  view.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    handleAction(target.dataset.action, target);
  });

  view.addEventListener('change', event => {
    const target = event.target;
    if (target.classList.contains('recipe-img-uploader')) {
      handleRecipeImageUpload(target);
    }
  });

  function handleRecipeImageUpload(input) {
    const id = Number(input.dataset.id);
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64 = e.target.result;
      const food = state.foods.find(f => f.id === id);
      if (food) {
        food.image_url = base64;
        saveState();
        render();
        toast('美食图片已成功更新！');
      }
    };
    reader.readAsDataURL(file);
  }

  render();
})();

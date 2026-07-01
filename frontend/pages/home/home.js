import { request } from '../../utils/request.js';

Page({
  data: {
    isPaired: false,
    userInfo: null,
    partnerInfo: null,
    loveDays: 0,
    todayFood: '',
    todayDate: '',
    nearestAnniversary: null,

    // 日历状态
    currentYear: 0,
    currentMonth: 0,
    calendarDays: [],
    monthlyEvents: {},
    selectedDateStr: '',
    selectedDayAgenda: null,
    showCustomDialog: false,
    customDialogText: '',
    customDialogTime: '',
    calendarExpanded: false
  },

  onShow() {
    this.checkLoginStatus();
    this.initCalendar();
  },

  /**
   * 检查并刷新用户的登录及数据状态
   */
  async checkLoginStatus() {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({
        isPaired: false,
        userInfo: null,
        partnerInfo: null,
        loveDays: 0,
        todayFood: '请先登录',
        todayDate: '请先登录',
        nearestAnniversary: null
      });
      return;
    }

    try {
      const meData = await request({ url: '/auth/me' });
      const { user, partner } = meData;
      const isPaired = !!(user && user.partner_id);

      this.setData({
        isPaired,
        userInfo: user,
        partnerInfo: partner
      });

      this.calculateLoveDays(user);

      if (isPaired) {
        this.fetchTodayDashboard();
      }
    } catch (err) {
      console.error('[Home Page] 刷新失败:', err);
    }
  },

  /**
   * 计算恋爱天数
   */
  calculateLoveDays(user) {
    if (!user) return;
    const startDate = new Date(user.created_at || Date.now());
    const today = new Date();
    const diffTime = Math.abs(today - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    this.setData({
      loveDays: diffDays || 1
    });
  },

  /**
   * 拉取今日吃什么、去哪约会以及最近纪念日
   */
  async fetchTodayDashboard() {
    try {
      const dbRes = await Promise.allSettled([
        request({ url: '/food/today' }),
        request({ url: '/date/today' }),
        request({ url: '/anniversary/nearest' })
      ]);

      const todayFood = dbRes[0].status === 'fulfilled' && dbRes[0].value.food ? dbRes[0].value.food.name : '';
      const todayDate = dbRes[1].status === 'fulfilled' && dbRes[1].value.plan ? `${dbRes[1].value.plan.title} (${dbRes[1].value.plan.meeting_time})` : '';
      const nearestAnniversary = dbRes[2].status === 'fulfilled' ? dbRes[2].value.anniversary : null;

      this.setData({
        todayFood,
        todayDate,
        nearestAnniversary
      });
    } catch (err) {
      console.warn('[Home Page] 获取看板数据失败:', err);
    }
  },

  /**
   * 初始化日历参数
   */
  initCalendar() {
    const today = new Date();
    const currentYear = this.data.currentYear || today.getFullYear();
    const currentMonth = this.data.currentMonth || (today.getMonth() + 1);
    const selectedDateStr = this.data.selectedDateStr || this.formatDate(today);

    this.setData({
      currentYear,
      currentMonth,
      selectedDateStr
    });
    this.fetchMonthlyEvents();
  },

  /**
   * 格式化 Date 为 YYYY-MM-DD
   */
  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * 拉取单月的所有日程与琐事标记点
   */
  async fetchMonthlyEvents() {
    const { currentYear, currentMonth } = this.data;
    const token = wx.getStorageSync('token');
    if (!token) {
      // 未登录直接调用网格绘制
      this.generateCalendarGrid();
      return;
    }

    try {
      const res = await request({
        url: `/calendar/month?year=${currentYear}&month=${currentMonth}`
      });
      this.setData({
        monthlyEvents: res.events || {}
      });
    } catch (err) {
      console.warn('[Calendar] 获取单月日程数据失败，启用本地缓存或 Mock 兜底');
      const todayStr = this.formatDate(new Date());
      const mockEvents = {};
      mockEvents[todayStr] = [
        { id: 101, type: 'anniversary', title: '宝贝相恋纪念日 💖', time: null },
        { id: 102, type: 'kitchen', title: '大厨烹饪了：麻辣香锅 🍳', time: '18:30' }
      ];
      this.setData({
        monthlyEvents: mockEvents
      });
    } finally {
      this.generateCalendarGrid();
    }
  },

  /**
   * 绘制 42 个格子组成的日历面板
   */
  generateCalendarGrid() {
    const { currentYear, currentMonth, selectedDateStr, monthlyEvents, calendarExpanded } = this.data;
    const todayStr = this.formatDate(new Date());

    let days = [];

    if (!calendarExpanded) {
      // 14天简版视图：取本周周日开始的连续 14 天 (2行)
      const todayDate = new Date();
      const start = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - todayDate.getDay());
      for (let i = 0; i < 14; i++) {
        const dObj = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const dateStr = this.formatDate(dObj);
        days.push(this.buildDayObj(
          dObj.getFullYear(),
          dObj.getMonth() + 1,
          dObj.getDate(),
          dateStr,
          dObj.getMonth() + 1 === currentMonth,
          todayStr,
          selectedDateStr,
          monthlyEvents
        ));
      }
    } else {
      // 完整月份视图
      const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay();
      const totalDays = new Date(currentYear, currentMonth, 0).getDate();
      const prevMonthTotalDays = new Date(currentYear, currentMonth - 1, 0).getDate();

      // 1. 上月余留格子
      for (let i = firstDayIndex - 1; i >= 0; i--) {
        const d = prevMonthTotalDays - i;
        const m = currentMonth === 1 ? 12 : currentMonth - 1;
        const y = currentMonth === 1 ? currentYear - 1 : currentYear;
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push(this.buildDayObj(y, m, d, dateStr, false, todayStr, selectedDateStr, monthlyEvents));
      }

      // 2. 本月格子
      for (let d = 1; d <= totalDays; d++) {
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push(this.buildDayObj(currentYear, currentMonth, d, dateStr, true, todayStr, selectedDateStr, monthlyEvents));
      }

      // 3. 下月余留格子填充
      const totalGridCells = (firstDayIndex + totalDays) <= 35 ? 35 : 42;
      const remainingCells = totalGridCells - days.length;
      for (let d = 1; d <= remainingCells; d++) {
        const m = currentMonth === 12 ? 1 : currentMonth + 1;
        const y = currentMonth === 12 ? currentYear + 1 : currentYear;
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push(this.buildDayObj(y, m, d, dateStr, false, todayStr, selectedDateStr, monthlyEvents));
      }
    }

    this.setData({ calendarDays: days });
    this.updateSelectedDayAgenda();
  },

  buildDayObj(year, month, day, dateStr, isCurrentMonth, todayStr, selectedDateStr, monthlyEvents) {
    const dayEvents = monthlyEvents[dateStr] || [];
    return {
      year,
      month,
      day,
      dateStr,
      isCurrentMonth,
      isToday: dateStr === todayStr,
      isSelected: dateStr === selectedDateStr,
      hasAnniversary: dayEvents.some(e => e.type === 'anniversary'),
      hasDate: dayEvents.some(e => e.type === 'date'),
      hasKitchen: dayEvents.some(e => e.type === 'kitchen'),
      hasFood: dayEvents.some(e => e.type === 'food'),
      hasCustom: dayEvents.some(e => e.type === 'custom')
    };
  },

  /**
   * 刷新当前选中日期的日程列表抽屉
   */
  updateSelectedDayAgenda() {
    const { selectedDateStr, monthlyEvents } = this.data;
    const dayEvents = monthlyEvents[selectedDateStr] || [];

    const typeTextMap = {
      anniversary: '纪念日',
      date: '约会',
      kitchen: '爱心厨',
      food: '出去吃',
      custom: '备忘'
    };

    const formattedEvents = dayEvents.map(e => ({
      ...e,
      typeText: typeTextMap[e.type] || '日程',
      uniqueId: `${e.type}-${e.id}`
    }));

    this.setData({
      selectedDayAgenda: {
        dateStr: selectedDateStr,
        events: formattedEvents
      }
    });
  },

  /**
   * 点击切换日历展开/收起状态
   */
  toggleCalendar() {
    this.setData({
      calendarExpanded: !this.data.calendarExpanded
    }, () => {
      this.generateCalendarGrid();
    });
  },

  /**
   * 点击选择某个日期格子
   */
  selectDay(e) {
    const dayObj = e.currentTarget.dataset.day;
    this.setData({
      selectedDateStr: dayObj.dateStr
    }, () => {
      this.generateCalendarGrid();
    });
  },

  /**
   * 上一月
   */
  prevMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 1) {
      currentYear -= 1;
      currentMonth = 12;
    } else {
      currentMonth -= 1;
    }
    this.setData({ currentYear, currentMonth }, () => {
      this.fetchMonthlyEvents();
    });
  },

  /**
   * 下一月
   */
  nextMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 12) {
      currentYear += 1;
      currentMonth = 1;
    } else {
      currentMonth += 1;
    }
    this.setData({ currentYear, currentMonth }, () => {
      this.fetchMonthlyEvents();
    });
  },

  /**
   * 回到今天
   */
  backToToday() {
    const today = new Date();
    this.setData({
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth() + 1,
      selectedDateStr: this.formatDate(today)
    }, () => {
      this.fetchMonthlyEvents();
    });
  },

  /**
   * 显示/隐藏添加琐事弹窗
   */
  showAddCustomDialog() {
    this.setData({
      showCustomDialog: true,
      customDialogText: '',
      customDialogTime: ''
    });
  },

  hideAddCustomDialog() {
    this.setData({
      showCustomDialog: false
    });
  },

  onInputCustomText(e) {
    this.setData({ customDialogText: e.detail.value });
  },

  onCustomTimeChange(e) {
    this.setData({ customDialogTime: e.detail.value });
  },

  /**
   * 提交添加自定义备忘
   */
  async submitCustomEvent() {
    const { customDialogText, customDialogTime, selectedDateStr } = this.data;
    if (!customDialogText.trim()) {
      wx.showToast({ title: '请输入备忘内容', icon: 'none' });
      return;
    }

    try {
      await request({
        url: '/calendar/custom-event',
        method: 'POST',
        data: {
          title: customDialogText.trim(),
          event_date: selectedDateStr,
          event_time: customDialogTime || null
        },
        showLoading: true
      });
      wx.showToast({ title: '备忘保存成功', icon: 'success' });
      this.setData({
        showCustomDialog: false
      });
      this.fetchMonthlyEvents();
    } catch (err) {
      console.error('[Calendar] 新增备忘失败:', err);
      // Mock 兜底
      const { monthlyEvents } = this.data;
      if (!monthlyEvents[selectedDateStr]) {
        monthlyEvents[selectedDateStr] = [];
      }
      monthlyEvents[selectedDateStr].push({
        id: Date.now(),
        type: 'custom',
        title: customDialogText.trim(),
        time: customDialogTime || null
      });
      this.setData({
        monthlyEvents,
        showCustomDialog: false
      });
      this.generateCalendarGrid();
      wx.showToast({ title: '保存成功(本地)', icon: 'success' });
    }
  },

  /**
   * 删除自定义备忘
   */
  async deleteCustomEvent(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除提示',
      content: '确定要删除这条日程备忘吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await request({
              url: `/calendar/custom-event/${id}`,
              method: 'DELETE',
              showLoading: true
            });
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.fetchMonthlyEvents();
          } catch (err) {
            console.error('[Calendar] 删除备忘失败:', err);
            // Mock 兜底删除
            const { selectedDateStr, monthlyEvents } = this.data;
            if (monthlyEvents[selectedDateStr]) {
              monthlyEvents[selectedDateStr] = monthlyEvents[selectedDateStr].filter(item => item.id !== Number(id) && item.id !== id);
            }
            this.setData({ monthlyEvents });
            this.generateCalendarGrid();
            wx.showToast({ title: '删除成功(本地)', icon: 'success' });
          }
        }
      }
    });
  },

  /**
   * 跳转到吃什么
   */
  goToFood() {
    wx.switchTab({
      url: '/pages/food/food'
    });
  },

  /**
   * 跳转到去哪玩行程
   */
  goToDate() {
    wx.switchTab({
      url: '/pages/date/date'
    });
  }
});

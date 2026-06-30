import { request } from '../../utils/request.js';

Page({
  data: {
    isPaired: false,
    userInfo: null,
    partnerInfo: null,
    loveDays: 0,
    todayFood: '',
    todayDate: '',
    nearestAnniversary: null
  },

  onShow() {
    this.checkLoginStatus();
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
      // 1. 获取最新的个人与伴侣配对资料
      const meData = await request({ url: '/auth/me' });
      const { user, partner } = meData;

      const isPaired = !!(user && user.partner_id);

      this.setData({
        isPaired,
        userInfo: user,
        partnerInfo: partner
      });

      // 2. 计算恋爱天数
      this.calculateLoveDays(user);

      // 3. 拉取今日看板信息 (点餐与行程聚合) 与纪念日倒计时
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
    
    // 默认使用用户的创建时间或配对时间作为起点计算天数 (后续可在纪念日管理中指定"恋爱日")
    const startDate = new Date(user.created_at || Date.now());
    const today = new Date();
    
    // 计算天数差
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
      // 占位逻辑：后续在完成点餐、约会、纪念日接口后，我们会调用真实的接口：
      // - /api/food/today-locked 获取今天锁定的食物
      // - /api/date/today-accepted 获取今天确认的约会
      // - /api/anniversary/nearest 获取最近的纪念日
      // 暂时通过安全方式拉取或 Mock 模拟数据
      
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
      console.warn('[Home Page] 获取看板数据发生失败 (可能后端模块还未完全实现):', err);
    }
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
   * 跳转到约会行程
   */
  goToDate() {
    wx.switchTab({
      url: '/pages/date/date'
    });
  }
});

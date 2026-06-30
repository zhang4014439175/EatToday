import { request } from '../../utils/request.js';
import { login, logout } from '../../utils/auth.js';

Page({
  data: {
    isLogin: false,
    isPaired: false,
    userInfo: null,
    partnerInfo: null,
    inputPairCode: '',
    
    // 纪念日管理
    showAddAnniversary: false,
    newAnniversary: {
      title: '',
      date: '',
      is_yearly: true
    },
    anniversaries: [],
    
    // 设置项
    settings: {
      dateNotify: true,
      foodNotify: true
    }
  },

  onShow() {
    this.checkLoginState();
  },

  /**
   * 检查当前的本地登录态
   */
  checkLoginState() {
    const token = wx.getStorageSync('token');
    if (token) {
      this.setData({ isLogin: true });
      this.loadProfileData();
    } else {
      this.setData({
        isLogin: false,
        isPaired: false,
        userInfo: null,
        partnerInfo: null,
        anniversaries: []
      });
    }
  },

  /**
   * 触发一键登录/注册
   */
  async handleLogin() {
    try {
      // 随机分配一个可爱的微信昵称，用于演示
      const names = ['小甜甜', '大魔王', '小憨包', '干饭第一名', '猫系女友', '犬系男友'];
      const randomName = names[Math.floor(Math.random() * names.length)];
      
      const user = await login(randomName, '');
      wx.showToast({ title: '登录成功！', icon: 'success' });
      
      this.setData({ isLogin: true });
      this.loadProfileData();
    } catch (err) {
      console.error('[Profile Page] 登录失败:', err);
    }
  },

  /**
   * 载入个人及配对伴侣数据，以及纪念日列表
   */
  async loadProfileData() {
    try {
      // 1. 获取最新用户信息
      const meData = await request({ url: '/auth/me' });
      const { user, partner } = meData;
      const isPaired = !!(user && user.partner_id);

      this.setData({
        userInfo: user,
        partnerInfo: partner,
        isPaired
      });

      // 2. 加载纪念日列表
      this.fetchAnniversaries();
    } catch (err) {
      console.warn('[Profile Page] 拉取线上主页数据失败，启用本地 Mock');
      // 如果后端没通，设置 Mock 个人账户以便前端展示
      const mockUser = {
        id: 1,
        nickname: '本地测试用户',
        pair_code: 'LOV520',
        avatar_url: '',
        partner_id: null
      };
      this.setData({
        userInfo: mockUser,
        isPaired: false
      });
    }
  },

  /**
   * 复制我自己的配对码
   */
  copyPairCode() {
    const code = this.data.userInfo?.pair_code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '配对码已复制', icon: 'success' });
      }
    });
  },

  onInputPairCode(e) {
    this.setData({ inputPairCode: e.detail.value });
  },

  /**
   * 提交绑定伴侣配对码
   */
  async handlePair() {
    const { inputPairCode } = this.data;
    if (!inputPairCode.trim()) {
      wx.showToast({ title: '请输入配对码', icon: 'none' });
      return;
    }

    try {
      const res = await request({
        url: '/auth/pair',
        method: 'POST',
        data: { pairCode: inputPairCode },
        showLoading: true,
        loadingMsg: '正在绑定...'
      });

      wx.showToast({ title: res.message || '配对成功！', icon: 'success' });
      this.setData({ inputPairCode: '' });
      this.loadProfileData();
    } catch (err) {
      // 本地 Mock 配对成功效果
      wx.showToast({ title: '模拟牵线成功！', icon: 'success' });
      const mockPartner = {
        id: 99,
        nickname: '猪猪队友 🐷',
        avatar_url: ''
      };
      const updatedUser = { ...this.data.userInfo, partner_id: 99 };
      this.setData({
        userInfo: updatedUser,
        partnerInfo: mockPartner,
        isPaired: true,
        inputPairCode: ''
      });
      // 写入本地缓存模拟
      wx.setStorageSync('userInfo', JSON.stringify(updatedUser));
      wx.setStorageSync('partnerInfo', JSON.stringify(mockPartner));
      this.fetchAnniversaries();
    }
  },

  /**
   * 解除绑定伴侣关系
   */
  handleUnpair() {
    wx.showModal({
      title: '解除绑定',
      content: '确定要解除与伴侣的情侣绑定关系吗？解绑后双方的数据将不再同步。',
      confirmColor: '#ff3333',
      success: async (res) => {
        if (res.confirm) {
          try {
            await request({
              url: '/auth/unpair',
              method: 'POST',
              showLoading: true,
              loadingMsg: '解除绑定中...'
            });
            wx.showToast({ title: '已解除绑定', icon: 'success' });
            this.loadProfileData();
          } catch (err) {
            // Mock 解绑
            const updatedUser = { ...this.data.userInfo, partner_id: null };
            this.setData({
              userInfo: updatedUser,
              partnerInfo: null,
              isPaired: false,
              anniversaries: []
            });
            wx.setStorageSync('userInfo', JSON.stringify(updatedUser));
            wx.removeStorageSync('partnerInfo');
            wx.showToast({ title: '模拟已解除绑定', icon: 'success' });
          }
        }
      }
    });
  },

  // --- 纪念日管理 ---

  /**
   * 拉取纪念日列表
   */
  async fetchAnniversaries() {
    try {
      const res = await request({ url: '/anniversary' });
      this.setData({ anniversaries: res.anniversaries || [] });
    } catch (err) {
      console.warn('[Profile Page] 获取纪念日列表失败，加载本地 Mock');
      const mockAnniversaries = [
        { id: 1, title: '我们第一次相遇 🌸', date: '2025-05-20', is_yearly: 1 },
        { id: 2, title: '去影院看第一场电影 🍿', date: '2025-06-01', is_yearly: 0 }
      ];
      this.setData({ anniversaries: mockAnniversaries });
    }
  },

  showAddAnniversaryForm() {
    const todayStr = new Date().toISOString().split('T')[0];
    this.setData({
      showAddAnniversary: !this.data.showAddAnniversary,
      'newAnniversary.title': '',
      'newAnniversary.date': todayStr,
      'newAnniversary.is_yearly': true
    });
  },

  onInputAnnTitle(e) { this.setData({ 'newAnniversary.title': e.detail.value }); },
  onAnnDateChange(e) { this.setData({ 'newAnniversary.date': e.detail.value }); },
  onAnnYearlyChange(e) { this.setData({ 'newAnniversary.is_yearly': e.detail.value }); },

  /**
   * 新增并保存纪念日
   */
  async submitAnniversary() {
    const { title, date, is_yearly } = this.data.newAnniversary;

    if (!title.trim()) {
      wx.showToast({ title: '请输入纪念日名称', icon: 'none' });
      return;
    }

    try {
      await request({
        url: '/anniversary',
        method: 'POST',
        data: {
          title,
          date,
          isYearly: is_yearly ? 1 : 0
        },
        showLoading: true
      });
      wx.showToast({ title: '添加纪念日成功', icon: 'success' });
      this.setData({ showAddAnniversary: false });
      this.fetchAnniversaries();
    } catch (err) {
      // Mock 添加纪念日
      const newAnn = {
        id: Date.now(),
        title,
        date,
        is_yearly: is_yearly ? 1 : 0
      };
      this.setData({
        anniversaries: [newAnn, ...this.data.anniversaries],
        showAddAnniversary: false
      });
      wx.showToast({ title: '已保存到本地模拟列表', icon: 'success' });
    }
  },

  /**
   * 删除纪念日
   */
  async deleteAnniversary(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await request({
        url: `/anniversary/${id}`,
        method: 'DELETE',
        showLoading: true
      });
      this.fetchAnniversaries();
    } catch (err) {
      // Mock 删除纪念日
      const filtered = this.data.anniversaries.filter(item => item.id !== id);
      this.setData({ anniversaries: filtered });
      wx.showToast({ title: '纪念日已删除', icon: 'success' });
    }
  },

  // --- 设置开关触发器 ---

  toggleDateNotify(e) {
    this.setData({ 'settings.dateNotify': e.detail.value });
    wx.showToast({ title: '设置已保存', icon: 'none' });
  },

  toggleFoodNotify(e) {
    this.setData({ 'settings.foodNotify': e.detail.value });
    wx.showToast({ title: '设置已保存', icon: 'none' });
  },

  /**
   * 退出登录
   */
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          logout();
          this.checkLoginState();
        }
      }
    });
  }
});

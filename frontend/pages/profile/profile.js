import { request } from '../../utils/request.js';
import { login, logout } from '../../utils/auth.js';
import { createSpace, joinSpace, switchSpace, getMySpaces, getCurrentSpace, leaveSpace } from '../../utils/space.js';

Page({
  data: {
    isLogin: false,
    userInfo: null,
    currentSpace: null,
    spaces: [],
    spaceMembers: [],
    activeTab: 'join', // 'join' | 'create'
    inputSpaceCode: '',
    inputSpaceName: '',
    
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
        userInfo: null,
        currentSpace: null,
        spaces: [],
        spaceMembers: [],
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
   * 载入个人空间与群组空间数据，以及纪念日列表
   */
  async loadProfileData() {
    try {
      // 1. 获取最新用户信息
      const meData = await request({ url: '/auth/me' });
      const { user } = meData;

      // 2. 获取我加入的全部空间列表
      const spaces = await getMySpaces();

      // 3. 获取当前空间成员与详细信息
      let currentSpace = null;
      let spaceMembers = [];
      try {
        const spaceData = await getCurrentSpace();
        currentSpace = spaceData.space;
        spaceMembers = spaceData.members;
      } catch (spaceErr) {
        console.error('获取活跃空间详情失败，尝试使用本地缓存', spaceErr);
        const cachedSpace = wx.getStorageSync('currentSpace');
        if (cachedSpace) {
          currentSpace = JSON.parse(cachedSpace);
        }
      }

      this.setData({
        userInfo: user,
        spaces,
        currentSpace,
        spaceMembers
      });

      // 4. 加载纪念日列表
      this.fetchAnniversaries();
    } catch (err) {
      console.warn('[Profile Page] 拉取线上空间数据失败，启用本地 Mock');
      const mockUser = {
        id: 1,
        nickname: '本地测试用户',
        pair_code: 'LOV520',
        avatar_url: ''
      };
      const mockSpace = { id: 1, name: '本地模拟空间', code: 'ABCDEF', type: 'group' };
      const mockMembers = [
        { id: 1, nickname: '本地测试用户', avatar_url: '', role: 'admin' },
        { id: 2, nickname: '模拟好友', avatar_url: '', role: 'member' }
      ];
      this.setData({
        userInfo: mockUser,
        currentSpace: mockSpace,
        spaceMembers: mockMembers,
        spaces: [mockSpace]
      });
    }
  },

  /**
   * 复制当前活跃空间的邀请码
   */
  copySpaceCode() {
    const code = this.data.currentSpace?.code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '邀请码已复制', icon: 'success' });
      }
    });
  },

  switchActionTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  onInputSpaceCode(e) {
    this.setData({ inputSpaceCode: e.detail.value });
  },

  onInputSpaceName(e) {
    this.setData({ inputSpaceName: e.detail.value });
  },

  /**
   * 创建新空间
   */
  async handleCreateSpace() {
    const name = this.data.inputSpaceName.trim();
    if (!name) {
      wx.showToast({ title: '请输入空间名称', icon: 'none' });
      return;
    }

    try {
      await createSpace(name);
      wx.showToast({ title: '空间创建成功', icon: 'success' });
      this.setData({ inputSpaceName: '' });
      this.loadProfileData();
    } catch (err) {
      wx.showToast({ title: err.message || '创建空间失败', icon: 'none' });
    }
  },

  /**
   * 加入已有的群组空间
   */
  async handleJoinSpace() {
    const code = this.data.inputSpaceCode.trim();
    if (!code) {
      wx.showToast({ title: '请输入空间邀请码', icon: 'none' });
      return;
    }

    try {
      await joinSpace(code);
      wx.showToast({ title: '成功加入空间', icon: 'success' });
      this.setData({ inputSpaceCode: '' });
      this.loadProfileData();
    } catch (err) {
      wx.showToast({ title: err.message || '加入空间失败', icon: 'none' });
    }
  },

  /**
   * 快速切换空间
   */
  async handleSwitchSpace(e) {
    const spaceId = e.currentTarget.dataset.id;
    if (spaceId === this.data.currentSpace?.id) return;

    try {
      await switchSpace(spaceId);
      wx.showToast({ title: '空间已切换', icon: 'success' });
      this.loadProfileData();
    } catch (err) {
      wx.showToast({ title: err.message || '切换空间失败', icon: 'none' });
    }
  },

  /**
   * 退出当前所选空间
   */
  handleLeaveCurrentSpace() {
    const space = this.data.currentSpace;
    if (!space || space.type === 'solo') return;

    wx.showModal({
      title: '退出空间',
      content: `确认要退出群组空间「${space.name}」吗？退出后，如果该空间没有其他成员，它将被彻底删除。`,
      confirmColor: '#ff3333',
      success: async (res) => {
        if (res.confirm) {
          try {
            await leaveSpace(space.id);
            wx.showToast({ title: '已成功退出空间', icon: 'success' });
            this.loadProfileData();
          } catch (err) {
            wx.showToast({ title: err.message || '退出空间失败', icon: 'none' });
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

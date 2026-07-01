import { request } from '../../utils/request.js';
import { initSpaceSwitcher } from '../../utils/space.js';

Page({
  data: {
    showForm: true,
    newProposal: {
      title: '',
      date: '',
      time: '',
      meeting_location: '',
      notes: ''
    },
    datePlans: [],
    wishlist: [],
    newWishName: '',
    statusMap: {
      'pending': '待确认',
      'accepted': '已同意',
      'rejected': '已婉拒',
      'revision_requested': '修改建议中'
    },
    userInfo: null,
    partnerInfo: null,
    currentSpace: null,
    
    // 修改建议弹窗状态
    reviseDialogVisible: false,
    tempRevisionNote: '',
    currentRevisePlanId: null
  },

  onShow() {
    const app = getApp();
    this.setData({
      currentSpace: app.globalData.currentSpace
    });

    initSpaceSwitcher(this, () => {
      this.loadUserInfos();
      this.fetchDatePlans();
      this.fetchWishlist();
    });

    this.loadUserInfos();
    this.fetchDatePlans();
    this.fetchWishlist();
  },

  /**
   * 加载用户信息
   */
  loadUserInfos() {
    const app = getApp();
    if (app && app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        partnerInfo: app.globalData.partnerInfo
      });
    } else {
      try {
        const userInfoStr = wx.getStorageSync('userInfo');
        if (userInfoStr) {
          const userInfo = JSON.parse(userInfoStr);
          this.setData({ userInfo });
        }
      } catch (e) {
        console.error(e);
      }
    }
  },

  /**
   * 获取去哪玩行程记录
   */
  async fetchDatePlans() {
    try {
      const res = await request({ url: '/date' });
      this.setData({ datePlans: res.plans || [] });
    } catch (err) {
      console.warn('[Date Page] 获取约会列表失败，启用 Mock 兜底');
      // Mock 行程数据，包含多种状态方便演示
      const mockPlans = [
        {
          id: 1,
          title: '去看周末晚上的大电影 🎬',
          meeting_time: '2026-07-04 19:30',
          meeting_location: '万达影城 (金街店)',
          notes: '记得提前买爆米花！',
          status: 'pending',
          created_by: 1, // 模拟自己创建的
          partner_id: 2
        },
        {
          id: 2,
          title: '一起去公园野餐吹风 🧺',
          meeting_time: '2026-07-05 14:00',
          meeting_location: '滨江湿地公园',
          notes: '带上餐垫和气泡水。',
          status: 'accepted',
          created_by: 2, // 模拟对方创建并已同意的
          partner_id: 1
        },
        {
          id: 3,
          title: '吃超辣海底捞火锅 🍲',
          meeting_time: '2026-07-06 18:00',
          meeting_location: '大悦城 5 楼',
          notes: '听说排队很长，提前拿号。',
          status: 'revision_requested',
          revision_note: '那天我下班可能晚了，能改到晚上 7 点吗？或者是吃不辣的粤菜？',
          created_by: 1,
          partner_id: 2
        }
      ];
      this.setData({ datePlans: mockPlans });
    }
  },

  /**
   * 获取灵感池清单
   */
  async fetchWishlist() {
    try {
      const res = await request({ url: '/date/wishlist' });
      this.setData({ wishlist: res.wishlist || [] });
    } catch (err) {
      console.warn('[Date Page] 获取愿望单失败，启用 Mock 兜底');
      const mockWishlist = [
        { id: 1, name: '一起去抓娃娃' },
        { id: 2, name: '去海洋馆看水母' },
        { id: 3, name: '看一次海边日出' }
      ];
      this.setData({ wishlist: mockWishlist });
    }
  },

  /**
   * 一键导入预置约会好玩愿望
   */
  async importPresetWishes() {
    wx.showLoading({ title: '正在导入...' });
    try {
      const res = await request({
        url: '/date/wishlist/seed-defaults',
        method: 'POST'
      });
      wx.hideLoading();
      if (res.success) {
        wx.showToast({ title: '导入成功', icon: 'success' });
        this.fetchWishlist(); // 重新拉取
      } else {
        wx.showToast({ title: res.message || '导入失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[Date Page] 导入预置游玩愿望失败:', err);
      wx.showToast({ title: '网络请求错误，请重试', icon: 'none' });
    }
  },

  /**
   * 折叠/展开新增表单
   */
  toggleForm() {
    this.setData({ showForm: !this.data.showForm });
  },

  // 表单输入绑定
  onInputTitle(e) { this.setData({ 'newProposal.title': e.detail.value }); },
  onDateChange(e) { this.setData({ 'newProposal.date': e.detail.value }); },
  onTimeChange(e) { this.setData({ 'newProposal.time': e.detail.value }); },
  onInputLocation(e) { this.setData({ 'newProposal.meeting_location': e.detail.value }); },
  onInputNotes(e) { this.setData({ 'newProposal.notes': e.detail.value }); },

  /**
   * 发送去哪玩提案
   */
  async submitProposal() {
    const { title, date, time, meeting_location, notes } = this.data.newProposal;

    if (!title.trim()) {
      wx.showToast({ title: '请输入去哪玩主题', icon: 'none' });
      return;
    }
    if (!date || !time) {
      wx.showToast({ title: '请选择日期和时间', icon: 'none' });
      return;
    }

    const meetingTimeStr = `${date} ${time}`;

    try {
      await request({
        url: '/date',
        method: 'POST',
        data: {
          title,
          meetingTime: meetingTimeStr,
          meetingLocation: meeting_location,
          notes
        },
        showLoading: true,
        loadingMsg: '提交提案中...'
      });

      wx.showToast({ title: '提案发送成功！', icon: 'success' });
      this.resetForm();
      this.fetchDatePlans();
    } catch (err) {
      // Mock 添加提案
      const newPlan = {
        id: Date.now(),
        title,
        meeting_time: meetingTimeStr,
        meeting_location,
        notes,
        status: 'pending',
        created_by: this.data.userInfo?.id || 1,
        partner_id: 99
      };
      
      this.setData({
        datePlans: [newPlan, ...this.data.datePlans],
        showForm: false
      });
      this.resetForm();
      wx.showToast({ title: '已添加到本地模拟列表', icon: 'success' });
    }
  },

  resetForm() {
    this.setData({
      newProposal: { title: '', date: '', time: '', meeting_location: '', notes: '' }
    });
  },

  /**
   * 接受提案
   */
  async acceptProposal(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await request({
        url: `/date/${id}/accept`,
        method: 'POST',
        showLoading: true
      });
      wx.showToast({ title: '已接受约会！', icon: 'success' });
      this.fetchDatePlans();
    } catch (err) {
      // Mock 接受
      this.updateLocalPlanStatus(id, 'accepted');
      wx.showToast({ title: '模拟：已同意约会', icon: 'success' });
    }
  },

  /**
   * 拒绝提案 (婉拒)
   */
  async rejectProposal(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await request({
        url: `/date/${id}/reject`,
        method: 'POST',
        showLoading: true
      });
      wx.showToast({ title: '已拒绝提案', icon: 'success' });
      this.fetchDatePlans();
    } catch (err) {
      // Mock 拒绝
      this.updateLocalPlanStatus(id, 'rejected');
      wx.showToast({ title: '模拟：已拒绝该提案', icon: 'success' });
    }
  },

  /**
   * 显示修改建议弹窗
   */
  showReviseDialog(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      reviseDialogVisible: true,
      currentRevisePlanId: id,
      tempRevisionNote: ''
    });
  },

  hideReviseDialog() {
    this.setData({ reviseDialogVisible: false });
  },

  onInputRevisionNote(e) {
    this.setData({ tempRevisionNote: e.detail.value });
  },

  /**
   * 确认提交修改建议
   */
  async submitRevision() {
    const { currentRevisePlanId, tempRevisionNote } = this.data;
    if (!tempRevisionNote.trim()) {
      wx.showToast({ title: '请输入修改建议内容', icon: 'none' });
      return;
    }

    try {
      await request({
        url: `/date/${currentRevisePlanId}/revision`,
        method: 'POST',
        data: { revisionNote: tempRevisionNote },
        showLoading: true
      });
      wx.showToast({ title: '已成功发送修改意见', icon: 'success' });
      this.hideReviseDialog();
      this.fetchDatePlans();
    } catch (err) {
      // Mock 提交修改建议
      const plans = this.data.datePlans.map(item => {
        if (item.id === currentRevisePlanId) {
          return {
            ...item,
            status: 'revision_requested',
            revision_note: tempRevisionNote
          };
        }
        return item;
      });
      this.setData({
        datePlans: plans,
        reviseDialogVisible: false
      });
      wx.showToast({ title: '模拟：修改建议已发送', icon: 'success' });
    }
  },

  /**
   * 撤回提案
   */
  async cancelProposal(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await request({
        url: `/date/${id}`,
        method: 'DELETE',
        showLoading: true
      });
      this.fetchDatePlans();
    } catch (err) {
      // Mock 撤回
      const plans = this.data.datePlans.filter(item => item.id !== id);
      this.setData({ datePlans: plans });
      wx.showToast({ title: '提案已撤回', icon: 'success' });
    }
  },

  updateLocalPlanStatus(id, status) {
    const plans = this.data.datePlans.map(item => {
      if (item.id === id) {
        return { ...item, status };
      }
      return item;
    });
    this.setData({ datePlans: plans });
  },

  // --- 约会灵感池逻辑 ---

  onInputWishName(e) {
    this.setData({ newWishName: e.detail.value });
  },

  /**
   * 添加愿望灵感
   */
  async addWish() {
    const { newWishName } = this.data;
    if (!newWishName.trim()) return;

    const isDup = this.data.wishlist.some(w => w.name.trim() === newWishName.trim());
    if (isDup) {
      wx.showToast({ title: '该地方已经在清单中啦', icon: 'none' });
      return;
    }

    try {
      await request({
        url: '/date/wishlist',
        method: 'POST',
        data: { name: newWishName },
        showLoading: true
      });
      this.setData({ newWishName: '' });
      this.fetchWishlist();
    } catch (err) {
      // Mock 添加
      const newList = [...this.data.wishlist, { id: Date.now(), name: newWishName.trim() }];
      this.setData({
        wishlist: newList,
        newWishName: ''
      });
      wx.showToast({ title: '已加入愿望单', icon: 'success' });
    }
  },

  /**
   * 删除愿望
   */
  async deleteWish(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await request({
        url: `/date/wishlist/${id}`,
        method: 'DELETE',
        showLoading: true
      });
      this.fetchWishlist();
    } catch (err) {
      // Mock 删除
      const newList = this.data.wishlist.filter(item => item.id !== id);
      this.setData({ wishlist: newList });
      wx.showToast({ title: '已移除该愿望', icon: 'success' });
    }
  },

  /**
   * 一键将愿望“提为正式去哪玩行程”
   */
  wishToProposal(e) {
    const name = e.currentTarget.dataset.name;
    const todayStr = new Date().toISOString().split('T')[0];

    this.setData({
      showForm: true,
      'newProposal.title': `去打卡「${name}」✨`,
      'newProposal.date': todayStr,
      'newProposal.time': '18:00'
    });

    wx.showToast({
      title: '已将愿望载入提案表单',
      icon: 'none'
    });
  }
});

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
    this.ensureProposalDefaults();

    initSpaceSwitcher(this, () => {
      this.ensureProposalDefaults();
      this.loadUserInfos();
      this.fetchDatePlans();
    });

    this.loadUserInfos();
    this.fetchDatePlans();
  },

  formatDateValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  formatTimeValue(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  },

  getDefaultProposalTime() {
    const now = new Date();
    return {
      date: this.formatDateValue(now),
      time: this.formatTimeValue(now)
    };
  },

  ensureProposalDefaults() {
    const defaults = this.getDefaultProposalTime();
    const proposal = this.data.newProposal || {};
    this.setData({
      'newProposal.date': proposal.date || defaults.date,
      'newProposal.time': proposal.time || defaults.time
    });
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
      console.error('[Date Page] 获取约会列表失败:', err);
      this.setData({ datePlans: [] });
    }
  },

  // (游玩灵感清单已整合至右上角“趣玩库”独立页面)

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
      console.error('[Date Page] 提交提案失败:', err);
      // request.js 已经弹过错误 Toast，此处不再重复弹窗
    }
  },

  resetForm() {
    const defaults = this.getDefaultProposalTime();
    this.setData({
      newProposal: { title: '', date: defaults.date, time: defaults.time, meeting_location: '', notes: '' }
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
      console.error('[Date Page] 接受提案失败:', err);
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
      console.error('[Date Page] 拒绝提案失败:', err);
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
      console.error('[Date Page] 提交修改建议失败:', err);
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
      console.error('[Date Page] 撤回提案失败:', err);
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
   * 跳转到趣玩库独立页面
   */
  goToPlayBook() {
    wx.navigateTo({
      url: '/pages/wishlist/wishlist'
    });
  }
});

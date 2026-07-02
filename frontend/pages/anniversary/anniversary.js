import { request } from '../../utils/request.js';

Page({
  data: {
    nearestAnn: null,
    countdownList: [],
    countupList: [],
    activeTab: 'countdown', // 'countdown' | 'countup'
    showAddModal: false,
    spaces: [],
    selectedSpaceName: '',
    newAnn: {
      title: '',
      date: '',
      isYearly: true,
      spaceId: ''
    }
  },

  onShow() {
    this.loadData();
  },

  /**
   * 加载空间列表与纪念日列表
   */
  async loadData() {
    try {
      wx.showLoading({ title: '加载中...' });

      // 1. 获取加入的所有物理空间
      const spacesRes = await request({ url: '/space/my' });
      const spaces = spacesRes.spaces || [];

      // 2. 获取所有的纪念日
      const annRes = await request({ url: '/anniversary' });
      const list = annRes.anniversaries || [];

      this.processAnniversaries(list, spaces);
    } catch (err) {
      console.error('加载纪念日数据失败，启用本地 Mock', err);
      // Mock数据兜底
      const mockSpaces = [
        { id: 1, name: '个人空间' },
        { id: 2, name: '我们俩的空间' }
      ];
      const mockAnniversaries = [
        { id: 101, title: '恋爱纪念日 🌸', date: '2025-05-20', is_yearly: 1, space_name: '我们俩的空间', space_id: 2 },
        { id: 102, title: '去影院看第一场电影 🍿', date: '2025-06-01', is_yearly: 0, space_name: '个人空间', space_id: 1 },
        { id: 103, title: '毕业一周年 🎓', date: '2025-07-02', is_yearly: 0, space_name: '个人空间', space_id: 1 },
        { id: 104, title: '跨年钟声倒计时 🔔', date: '2026-12-31', is_yearly: 0, space_name: '我们俩的空间', space_id: 2 }
      ];
      this.processAnniversaries(mockAnniversaries, mockSpaces);
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 在前端处理及分配纪念日为：倒计时列表 与 累计日列表
   */
  processAnniversaries(list, spaces) {
    const countdownList = [];
    const countupList = [];

    list.forEach(item => {
      const calculation = this.calculateDays(item.date, item.is_yearly);
      if (!calculation) return;

      const formattedItem = {
        ...item,
        is_yearly: !!item.is_yearly
      };

      if (calculation.type === 'countdown') {
        formattedItem.daysLeft = calculation.days;
        countdownList.push(formattedItem);
      } else {
        formattedItem.daysElapsed = calculation.days;
        countupList.push(formattedItem);
      }
    });

    // 排序
    // 倒数日：按剩余天数从小到大排序
    countdownList.sort((a, b) => a.daysLeft - b.daysLeft);
    // 累计日：按已过去天数从小到大（或日期从近到远）排序，这里让最新的在上面
    countupList.sort((a, b) => a.daysElapsed - b.daysElapsed);

    // 计算最近焦点倒计时 (来自 countdownList 的第一个)
    const nearestAnn = countdownList.length > 0 ? countdownList[0] : null;

    this.setData({
      nearestAnn,
      countdownList,
      countupList,
      spaces
    });
  },

  /**
   * 倒计时和已过去天数核心计算算法
   */
  calculateDays(dateStr, isYearly) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 格式化连接符，兼容 iOS Date 构造
    const cleanDateStr = dateStr.replace(/-/g, '/');
    const annDate = new Date(cleanDateStr);
    if (isNaN(annDate.getTime())) return null;
    annDate.setHours(0, 0, 0, 0);

    if (!isYearly) {
      // 单次纪念日
      const diffTime = annDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0) {
        return { type: 'countdown', days: diffDays };
      } else {
        return { type: 'countup', days: Math.abs(diffDays) };
      }
    } else {
      // 每年重复纪念日
      const currentYear = today.getFullYear();
      const targetAnnDate = new Date(annDate);
      targetAnnDate.setFullYear(currentYear);

      // 如果今年的纪念日已经过去，则计算明年的
      if (targetAnnDate < today) {
        targetAnnDate.setFullYear(currentYear + 1);
      }

      const diffTime = targetAnnDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { type: 'countdown', days: diffDays };
    }
  },

  /**
   * Tab 栏切换
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  /**
   * 打开新增 Modal 并初始化默认值
   */
  openAddModal() {
    const todayStr = new Date().toISOString().split('T')[0];
    const spaces = this.data.spaces;

    let defaultSpaceId = '';
    let selectedSpaceName = '';

    if (spaces.length > 0) {
      defaultSpaceId = spaces[0].id;
      selectedSpaceName = spaces[0].name;
    }

    this.setData({
      showAddModal: true,
      selectedSpaceName,
      newAnn: {
        title: '',
        date: todayStr,
        isYearly: true,
        spaceId: defaultSpaceId
      }
    });
  },

  closeAddModal() {
    this.setData({ showAddModal: false });
  },

  dummy() {},

  // --- 表单输入绑定 ---
  onInputTitle(e) {
    this.setData({ 'newAnn.title': e.detail.value });
  },

  onDateChange(e) {
    this.setData({ 'newAnn.date': e.detail.value });
  },

  onYearlyChange(e) {
    this.setData({ 'newAnn.isYearly': e.detail.value });
  },

  onSpaceChange(e) {
    const index = e.detail.value;
    const selectedSpace = this.data.spaces[index];
    if (selectedSpace) {
      this.setData({
        selectedSpaceName: selectedSpace.name,
        'newAnn.spaceId': selectedSpace.id
      });
    }
  },

  /**
   * 提交新增纪念日
   */
  async submitAnniversary() {
    const { title, date, isYearly, spaceId } = this.data.newAnn;

    if (!title || !title.trim()) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }

    if (!spaceId) {
      wx.showToast({ title: '请选择关联空间', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '提交中...' });
      await request({
        url: '/anniversary',
        method: 'POST',
        data: {
          title: title.trim(),
          date,
          isYearly: isYearly ? 1 : 0,
          spaceId
        }
      });

      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showAddModal: false });
      this.loadData();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 触发删除确认弹窗
   */
  confirmDelete(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title;

    wx.showModal({
      title: '删除纪念日',
      content: `确认要删除重要日子「${title}」吗？`,
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });
            await request({
              url: `/anniversary/${id}`,
              method: 'DELETE'
            });
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.loadData();
          } catch (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  }
});

import { request } from '../../utils/request.js';
import { getMySpaces } from '../../utils/space.js';

Page({
  data: {
    memoList: [],
    spaces: [],
    selectedSpaceName: '',
    newMemo: {
      title: '',
      date: '',
      time: '',
      spaceId: ''
    }
  },

  onLoad(options) {
    const today = this.formatDate(new Date());
    this.setData({
      'newMemo.date': options?.date || today
    });
  },

  onShow() {
    this.loadSpaces();
    this.loadMemos();
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  async loadSpaces() {
    try {
      const spaces = await getMySpaces();
      this.applySpaces(spaces.length ? spaces : this.getFallbackSpaces());
    } catch (err) {
      this.applySpaces(this.getFallbackSpaces());
    }
  },

  getFallbackSpaces() {
    const cachedSpace = wx.getStorageSync('currentSpace');
    if (cachedSpace) {
      try {
        return [JSON.parse(cachedSpace)];
      } catch (error) {
        return [];
      }
    }
    return [{ id: 1, name: '本地模拟空间' }];
  },

  applySpaces(spaces) {
    const normalizedSpaces = Array.isArray(spaces) ? spaces : [];
    const currentSpace = this.data.newMemo.spaceId
      ? normalizedSpaces.find(item => Number(item.id) === Number(this.data.newMemo.spaceId))
      : normalizedSpaces[0];

    this.setData({
      spaces: normalizedSpaces,
      selectedSpaceName: currentSpace?.name || '',
      'newMemo.spaceId': currentSpace?.id || ''
    });
  },

  async loadMemos() {
    try {
      const res = await request({ url: '/calendar/custom-events' });
      const memoList = (res.events || []).map(item => ({
        ...item,
        displayDate: item.event_date,
        displayTime: item.event_time || '全天',
        creatorName: item.creator_name || '我',
        spaceName: item.space_name || '当前空间'
      }));
      this.setData({ memoList });
    } catch (err) {
      wx.showToast({ title: err.message || '备忘加载失败', icon: 'none' });
    }
  },

  onInputTitle(e) {
    this.setData({ 'newMemo.title': e.detail.value });
  },

  onDateChange(e) {
    this.setData({ 'newMemo.date': e.detail.value });
  },

  onTimeChange(e) {
    this.setData({ 'newMemo.time': e.detail.value });
  },

  onSpaceChange(e) {
    const selectedSpace = this.data.spaces[e.detail.value];
    if (!selectedSpace) return;
    this.setData({
      selectedSpaceName: selectedSpace.name,
      'newMemo.spaceId': selectedSpace.id
    });
  },

  async submitMemo() {
    const { title, date, time, spaceId } = this.data.newMemo;
    if (!title.trim()) {
      wx.showToast({ title: '请输入备忘内容', icon: 'none' });
      return;
    }

    if (!spaceId) {
      wx.showToast({ title: '请选择所属空间', icon: 'none' });
      return;
    }

    try {
      await request({
        url: '/calendar/custom-event',
        method: 'POST',
        data: {
          title: title.trim(),
          event_date: date,
          event_time: time || null,
          spaceId
        },
        showLoading: true
      });
      wx.showToast({ title: '已添加备忘', icon: 'success' });
      this.setData({
        'newMemo.title': '',
        'newMemo.time': ''
      });
      this.loadMemos();
    } catch (err) {
      wx.showToast({ title: err.message || '添加失败', icon: 'none' });
    }
  },

  deleteMemo(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除备忘',
      content: `确认要删除「${title}」吗？`,
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request({
            url: `/calendar/custom-event/${id}`,
            method: 'DELETE',
            showLoading: true
          });
          wx.showToast({ title: '删除成功', icon: 'success' });
          this.loadMemos();
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      }
    });
  }
});

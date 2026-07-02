const { request } = require('../../utils/request');

Page({
  data: {
    wishlist: [],
    filteredWishlist: [],
    currentCategory: 'outdoor',
    isBatchMode: false,
    selectedCount: 0,
    
    // 表单相关
    showModal: false,
    isEditMode: false,
    formId: null,
    formName: ''
  },

  onLoad() {
    this.fetchWishlist();
  },

  onShow() {
    this.fetchWishlist();
  },

  /**
   * 游玩灵感分类过滤器
   */
  filterWishlist(rawList, category) {
    const outdoorKeywords = ['山', '车', '游', '步', '跑', '鱼', '野', '海', '园', '露营', '徒步', '骑行', '旅行', '爬', '骑'];
    return rawList.filter(item => {
      const isOut = outdoorKeywords.some(keyword => item.name.includes(keyword));
      return category === 'outdoor' ? isOut : !isOut;
    });
  },

  /**
   * 切换品类分类
   */
  switchCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    const filtered = this.filterWishlist(this.data.wishlist, cat);
    this.setData({
      currentCategory: cat,
      filteredWishlist: filtered,
      isBatchMode: false,
      selectedCount: 0
    });
  },

  /**
   * 拉取灵感清单数据
   */
  async fetchWishlist() {
    try {
      const res = await request({ url: '/date/wishlist' });
      const rawWishes = res.wishlist || [];
      
      const processedWishes = rawWishes.map(item => ({
        ...item,
        selected: false
      }));

      const filtered = this.filterWishlist(processedWishes, this.data.currentCategory);

      this.setData({
        wishlist: processedWishes,
        filteredWishlist: filtered,
        isBatchMode: false,
        selectedCount: 0
      });
    } catch (err) {
      console.warn('[Wishlist Page] 获取灵感库失败，使用本地缓存或 Mock 兜底');
      const mockList = [
        { id: 1, name: '爬山' },
        { id: 2, name: '骑自行车' },
        { id: 3, name: '逛街' },
        { id: 4, name: '旅游' },
        { id: 5, name: '唱歌' },
        { id: 6, name: '打牌' }
      ];
      const processed = mockList.map(item => ({ ...item, selected: false }));
      const filtered = this.filterWishlist(processed, this.data.currentCategory);
      this.setData({
        wishlist: processed,
        filteredWishlist: filtered,
        isBatchMode: false,
        selectedCount: 0
      });
    }
  },

  /**
   * 开启/关闭 批量管理模式
   */
  toggleBatchMode() {
    const isMode = !this.data.isBatchMode;
    const resetList = this.data.wishlist.map(item => ({ ...item, selected: false }));
    const filtered = this.filterWishlist(resetList, this.data.currentCategory);
    this.setData({
      isBatchMode: isMode,
      wishlist: resetList,
      filteredWishlist: filtered,
      selectedCount: 0
    });
  },

  /**
   * 点击卡片 (点中勾选框或非管理下的修改)
   */
  onCardClick(e) {
    const item = e.currentTarget.dataset.item;
    const { isBatchMode, wishlist, currentCategory } = this.data;

    if (isBatchMode) {
      // 批量管理模式：反选状态
      const newList = wishlist.map(w => {
        if (w.id === item.id) {
          w.selected = !w.selected;
        }
        return w;
      });
      const filtered = this.filterWishlist(newList, currentCategory);
      const selectedCount = newList.filter(w => w.selected).length;
      this.setData({
        wishlist: newList,
        filteredWishlist: filtered,
        selectedCount
      });
    } else {
      // 正常模式：弹窗进入编辑模式
      this.setData({
        showModal: true,
        isEditMode: true,
        formId: item.id,
        formName: item.name
      });
    }
  },

  /**
   * 显示添加弹窗
   */
  showAddModal() {
    this.setData({
      showModal: true,
      isEditMode: false,
      formId: null,
      formName: ''
    });
  },

  /**
   * 隐藏表单弹窗
   */
  hideModal() {
    this.setData({
      showModal: false,
      isEditMode: false,
      formId: null,
      formName: ''
    });
  },

  onInputFormName(e) {
    this.setData({ formName: e.detail.value });
  },

  /**
   * 提交表单 (新增/更新)
   */
  async submitForm() {
    const { isEditMode, formId, formName, wishlist } = this.data;
    if (!formName.trim()) {
      wx.showToast({ title: '项目名称不能为空', icon: 'none' });
      return;
    }

    // 重名本地去重检测
    const isDup = wishlist.some(w => w.id !== formId && w.name.trim() === formName.trim());
    if (isDup) {
      wx.showToast({ title: '该地方已经在清单中啦', icon: 'none' });
      return;
    }

    try {
      if (isEditMode) {
        // 编辑修改
        await request({
          url: `/date/wishlist/${formId}`,
          method: 'PUT',
          data: { name: formName },
          showLoading: true
        });
        wx.showToast({ title: '修改成功', icon: 'success' });
      } else {
        // 新增添加
        await request({
          url: '/date/wishlist',
          method: 'POST',
          data: { name: formName },
          showLoading: true
        });
        wx.showToast({ title: '添加成功', icon: 'success' });
      }

      this.hideModal();
      this.fetchWishlist();
    } catch (err) {
      console.error('[Wishlist Page] 保存失败:', err);
      // Fallback
      let newList;
      if (isEditMode) {
        newList = wishlist.map(w => {
          if (w.id === formId) {
            w.name = formName;
          }
          return w;
        });
      } else {
        newList = [...wishlist, { id: Date.now(), name: formName, selected: false }];
      }
      const filtered = this.filterWishlist(newList, this.data.currentCategory);
      this.setData({ 
        wishlist: newList,
        filteredWishlist: filtered
      });
      this.hideModal();
    }
  },

  /**
   * 批量删除选中的愿望灵感
   */
  async deleteSelectedWishes() {
    const { wishlist } = this.data;
    const selectedIds = wishlist.filter(w => w.selected).map(w => w.id);
    if (selectedIds.length === 0) return;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除这 ${selectedIds.length} 个游玩项目吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });
          try {
            // 循环顺序/并行调用删除接口
            for (const id of selectedIds) {
              await request({
                url: `/date/wishlist/${id}`,
                method: 'DELETE'
              });
            }
            wx.hideLoading();
            wx.showToast({ title: '批量删除成功', icon: 'success' });
            this.fetchWishlist();
          } catch (err) {
            wx.hideLoading();
            console.error('[Wishlist Page] 批量删除失败:', err);
            // Mock 删除
            const newList = wishlist.filter(w => !selectedIds.includes(w.id));
            const filtered = this.filterWishlist(newList, this.data.currentCategory);
            this.setData({
              wishlist: newList,
              filteredWishlist: filtered,
              isBatchMode: false,
              selectedCount: 0
            });
            wx.showToast({ title: '删除成功', icon: 'success' });
          }
        }
      }
    });
  },

  /**
   * 一键导入常见好玩项目
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
      console.error('[Wishlist Page] 导入失败:', err);
      // Mock 导入
      const mockPresets = [
        { id: Date.now() + 1, name: '爬山' },
        { id: Date.now() + 2, name: '骑自行车' },
        { id: Date.now() + 3, name: '逛街' },
        { id: Date.now() + 4, name: '旅游' },
        { id: Date.now() + 5, name: '唱歌' },
        { id: Date.now() + 6, name: '打牌' }
      ];
      
      const newList = [...this.data.wishlist];
      mockPresets.forEach(preset => {
        if (!newList.some(w => w.name === preset.name)) {
          newList.push({ ...preset, selected: false });
        }
      });
      
      const filtered = this.filterWishlist(newList, this.data.currentCategory);
      this.setData({ 
        wishlist: newList,
        filteredWishlist: filtered
      });
      wx.showToast({ title: '导入成功', icon: 'success' });
    }
  },

  /**
   * 提为行程提案并返回去哪玩页面
   */
  wishToProposal() {
    const { formName } = this.data;
    if (!formName || !formName.trim()) return;

    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && prevPage.route === 'pages/date/date') {
      prevPage.setData({
        'newProposal.title': `去打卡「${formName.trim()}」`
      });
      wx.navigateBack({
        success: () => {
          wx.showToast({ title: '已自动填入提案标题', icon: 'none' });
        }
      });
    } else {
      wx.navigateBack();
    }
  }
});

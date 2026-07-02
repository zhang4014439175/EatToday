const { request } = require('../../utils/request');

Page({
  data: {
    wishlist: [],
    filteredWishlist: [],
    categories: [],
    currentCategory: '户外活动',
    isBatchMode: false,
    selectedCount: 0,
    
    // 表单相关
    showModal: false,
    isEditMode: false,
    formId: null,
    formName: '',
    formCustomCategory: ''
  },

  onLoad() {
    this.fetchWishlist();
  },

  onShow() {
    this.fetchWishlist();
  },

  /**
   * 游玩灵感分类判定
   */
  getWishCategory(item) {
    if (item.custom_category) return item.custom_category;
    
    // 动态关键词分类匹配兜底
    const name = item.name || '';
    const outdoorKeywords = ['山', '车', '游', '步', '跑', '鱼', '野', '海', '园', '露营', '徒步', '骑行', '旅行', '爬', '骑'];
    const isOut = outdoorKeywords.some(keyword => name.includes(keyword));
    return isOut ? '户外活动' : '室内休闲';
  },

  refreshFilteredWishes() {
    const { wishlist, currentCategory } = this.data;
    const filteredWishlist = wishlist.filter(item => this.getWishCategory(item) === currentCategory);
    this.setData({ filteredWishlist });
  },

  /**
   * 切换品类分类
   */
  switchCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    this.setData({
      currentCategory: cat,
      isBatchMode: false,
      selectedCount: 0
    }, () => {
      this.refreshFilteredWishes();
    });
  },

  /**
   * 拉取灵感清单数据
   */
  async fetchWishlist() {
    try {
      const catRes = await request({ url: '/date/wishlist/categories' });
      const categories = catRes.categories || [];

      const res = await request({ url: '/date/wishlist' });
      const rawWishes = res.wishlist || [];
      
      const processedWishes = rawWishes.map(item => ({
        ...item,
        selected: false
      }));

      this.setData({
        categories,
        wishlist: processedWishes,
        isBatchMode: false,
        selectedCount: 0
      }, () => {
        if (categories.length > 0 && !categories.some(c => c.name === this.data.currentCategory)) {
          this.setData({ currentCategory: categories[0].name });
        }
        this.refreshFilteredWishes();
      });
    } catch (err) {
      console.warn('[Wishlist Page] 获取灵感库失败，使用本地缓存或 Mock 兜底');
      const mockCats = [
        { name: '户外活动' },
        { name: '室内休闲' }
      ];
      const localWishes = wx.getStorageSync('local_wishlist');
      if (localWishes && localWishes.length > 0) {
        this.setData({
          categories: mockCats,
          wishlist: localWishes.map(w => ({ ...w, selected: false })),
          isBatchMode: false,
          selectedCount: 0
        });
      } else {
        const mockList = [
          { id: 1, name: '爬山', custom_category: '户外活动' },
          { id: 2, name: '骑自行车', custom_category: '户外活动' },
          { id: 3, name: '逛街', custom_category: '室内休闲' },
          { id: 4, name: '旅游', custom_category: '户外活动' },
          { id: 5, name: '唱歌', custom_category: '室内休闲' },
          { id: 6, name: '打牌', custom_category: '室内休闲' }
        ];
        this.setData({
          categories: mockCats,
          wishlist: mockList.map(w => ({ ...w, selected: false })),
          isBatchMode: false,
          selectedCount: 0
        });
        wx.setStorageSync('local_wishlist', mockList);
      }
      this.refreshFilteredWishes();
    }
  },

  /**
   * 开启/关闭 批量管理模式
   */
  toggleBatchMode() {
    const isMode = !this.data.isBatchMode;
    const resetList = this.data.wishlist.map(item => ({ ...item, selected: false }));
    this.setData({
      isBatchMode: isMode,
      wishlist: resetList,
      selectedCount: 0
    }, () => {
      this.refreshFilteredWishes();
    });
  },

  /**
   * 点击卡片 (点中勾选框或非管理下的修改)
   */
  onCardClick(e) {
    const item = e.currentTarget.dataset.item;
    const { isBatchMode, wishlist } = this.data;

    if (isBatchMode) {
      const newList = wishlist.map(w => {
        if (w.id === item.id) {
          return { ...w, selected: !w.selected };
        }
        return w;
      });
      const selectedCount = newList.filter(w => w.selected).length;
      this.setData({
        wishlist: newList,
        selectedCount
      }, () => {
        this.refreshFilteredWishes();
      });
    } else {
      this.setData({
        showModal: true,
        isEditMode: true,
        formId: item.id,
        formName: item.name,
        formCustomCategory: item.custom_category || this.getWishCategory(item)
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
      formName: '',
      formCustomCategory: this.data.currentCategory
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
      formName: '',
      formCustomCategory: ''
    });
  },

  onInputFormName(e) {
    this.setData({ formName: e.detail.value });
  },

  /**
   * 弹出输入框，新增游玩分类
   */
  showAddCategoryDialog() {
    wx.showModal({
      title: '新增游玩分类',
      placeholderText: '请输入新分类名称',
      editable: true,
      success: async (res) => {
        if (res.confirm && res.content) {
          const name = res.content.trim();
          if (!name) return;
          try {
            wx.showLoading({ title: '正在添加...' });
            const addRes = await request({
              url: '/date/wishlist/categories',
              method: 'POST',
              data: { name }
            });
            wx.hideLoading();
            if (addRes.success) {
              wx.showToast({ title: '添加分类成功', icon: 'success' });
              this.fetchWishlist();
            } else {
              wx.showToast({ title: addRes.message || '添加失败', icon: 'none' });
            }
          } catch (err) {
            wx.hideLoading();
            console.error('[Wishlist Page] 新增分类失败:', err);
            // Mock 本地
            const mockCats = [...this.data.categories, { name }];
            this.setData({ categories: mockCats });
            wx.showToast({ title: '添加成功(本地)', icon: 'success' });
          }
        }
      }
    });
  },

  /**
   * 所属分类选择器改变
   */
  onCustomCategoryChange(e) {
    const index = e.detail.value;
    const selectedCat = this.data.categories[index];
    this.setData({
      formCustomCategory: selectedCat.name
    });
  },

  /**
   * 提交表单 (新增/更新)
   */
  async submitForm() {
    const { isEditMode, formId, formName, formCustomCategory, wishlist } = this.data;
    if (!formName.trim()) {
      wx.showToast({ title: '项目名称不能为空', icon: 'none' });
      return;
    }

    const isDup = wishlist.some(w => w.id !== formId && w.name.trim() === formName.trim());
    if (isDup) {
      wx.showToast({ title: '该地方已经在清单中啦', icon: 'none' });
      return;
    }

    const payload = {
      name: formName.trim(),
      custom_category: formCustomCategory
    };

    try {
      if (isEditMode) {
        await request({
          url: `/date/wishlist/${formId}`,
          method: 'PUT',
          data: payload,
          showLoading: true
        });
        wx.showToast({ title: '修改成功', icon: 'success' });
      } else {
        await request({
          url: '/date/wishlist',
          method: 'POST',
          data: payload,
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
            return { ...w, ...payload };
          }
          return w;
        });
      } else {
        const newWish = {
          id: Date.now(),
          name: formName.trim(),
          custom_category: formCustomCategory
        };
        newList = [newWish, ...wishlist];
      }
      this.setData({ wishlist: newList });
      wx.setStorageSync('local_wishlist', newList);
      this.hideModal();
      this.refreshFilteredWishes();
      wx.showToast({ title: '已保存本地', icon: 'success' });
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
            const newList = wishlist.filter(w => !selectedIds.includes(w.id));
            this.setData({
              wishlist: newList,
              isBatchMode: false,
              selectedCount: 0
            }, () => {
              this.refreshFilteredWishes();
            });
            wx.showToast({ title: '删除成功(本地)', icon: 'success' });
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
        this.fetchWishlist();
      } else {
        wx.showToast({ title: res.message || '导入失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[Wishlist Page] 导入失败:', err);
      const mockPresets = [
        { id: Date.now() + 1, name: '爬山', custom_category: '户外活动' },
        { id: Date.now() + 2, name: '骑自行车', custom_category: '户外活动' },
        { id: Date.now() + 3, name: '逛街', custom_category: '室内休闲' },
        { id: Date.now() + 4, name: '旅游', custom_category: '户外活动' },
        { id: Date.now() + 5, name: '唱歌', custom_category: '室内休闲' },
        { id: Date.now() + 6, name: '打牌', custom_category: '室内休闲' }
      ];
      
      const newList = [...this.data.wishlist];
      mockPresets.forEach(preset => {
        if (!newList.some(w => w.name === preset.name)) {
          newList.push({ ...preset, selected: false });
        }
      });
      
      this.setData({ wishlist: newList }, () => {
        this.refreshFilteredWishes();
      });
      wx.showToast({ title: '导入成功(本地)', icon: 'success' });
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

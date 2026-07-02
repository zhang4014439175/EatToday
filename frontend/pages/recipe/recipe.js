const { request } = require('../../utils/request');

Page({
  data: {
    foods: [],
    filteredFoods: [],
    categories: [],
    currentCategory: '拿手菜',
    isBatchMode: false,
    selectedCount: 0,
    
    // 弹窗表单状态
    showModal: false,
    isEditMode: false,
    formId: null,
    formName: '',
    formTags: '',
    formCategory: 'home',
    formCustomCategory: ''
  },

  onLoad() {
    this.fetchFoodList();
  },

  /**
   * 拉取所有美食数据
   */
  async fetchFoodList() {
    try {
      const catRes = await request({ url: '/food/categories' });
      const categories = catRes.categories || [];

      const res = await request({ url: '/food' });
      const rawFoods = res.foods || [];
      
      const processedFoods = rawFoods.map(item => {
        if (!item.category) {
          item.category = item.id <= 3 ? 'home' : 'out'; // Fallback
        }
        return {
          ...item,
          selected: false
        };
      });

      this.setData({
        categories,
        foods: processedFoods,
        isBatchMode: false,
        selectedCount: 0
      }, () => {
        if (categories.length > 0 && !categories.some(c => c.name === this.data.currentCategory)) {
          this.setData({ currentCategory: categories[0].name });
        }
        this.filterFoods();
      });
    } catch (err) {
      console.warn('[Recipe Page] 获取美食库失败，使用本地缓存或 Mock 兜底');
      const mockCats = [
        { name: '拿手菜' },
        { name: '热腾腾' },
        { name: '靓汤水' },
        { name: '主食面' },
        { name: '随便吃' }
      ];
      const localFoods = wx.getStorageSync('local_recipe_foods');
      if (localFoods && localFoods.length > 0) {
        this.setData({
          categories: mockCats,
          foods: localFoods.map(f => ({ ...f, selected: false })),
          isBatchMode: false,
          selectedCount: 0
        });
      } else {
        const mockList = [
          { id: 1, name: '火锅', category: 'home', custom_category: '热腾腾', tags: '特色,聚会', image_url: '' },
          { id: 2, name: '烤肉', category: 'home', custom_category: '热腾腾', tags: '肉食,美味', image_url: '' },
          { id: 3, name: '螺蛳粉', category: 'home', custom_category: '主食面', tags: '酸辣', image_url: '' },
          { id: 4, name: '日料寿司', category: 'out', custom_category: '拿手菜', tags: '精致', image_url: '' },
          { id: 5, name: '麻辣烫', category: 'out', custom_category: '热腾腾', tags: '麻辣', image_url: '' },
          { id: 6, name: '汉堡炸鸡', category: 'out', custom_category: '随便吃', tags: '高热量', image_url: '' }
        ];
        this.setData({
          categories: mockCats,
          foods: mockList,
          isBatchMode: false,
          selectedCount: 0
        });
        wx.setStorageSync('local_recipe_foods', mockList);
      }
      this.filterFoods();
    }
  },

  /**
   * 一键导入预置常见菜品
   */
  async importPresetFoods() {
    wx.showLoading({ title: '正在导入...' });
    try {
      const res = await request({
        url: '/food/seed-defaults',
        method: 'POST'
      });
      wx.hideLoading();
      if (res.success) {
        wx.showToast({ title: '导入成功', icon: 'success' });
        this.fetchFoodList(); // 重新拉取
      } else {
        wx.showToast({ title: res.message || '导入失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[Recipe Page] 导入预置菜品失败:', err);
      wx.showToast({ title: '网络请求错误，请重试', icon: 'none' });
    }
  },

  /**
   * 自动判定菜肴所属标签分类
   */
  getDishCategory(dish) {
    if (dish.custom_category) return dish.custom_category;

    const name = dish.name || '';
    const tags = ((dish.tags || '') + name).toLowerCase();
    if (tags.includes('拿手') || tags.includes('招牌') || tags.includes('推荐') || dish.id <= 3) return '拿手菜';
    if (tags.includes('汤') || tags.includes('水') || tags.includes('煲')) return '靓汤水';
    if (tags.includes('面') || tags.includes('饭') || tags.includes('粉') || tags.includes('主食')) return '主食面';
    if (tags.includes('热') || tags.includes('炒') || tags.includes('肉') || tags.includes('辣') || tags.includes('川') || tags.includes('火锅') || tags.includes('烤') || tags.includes('炸') || tags.includes('煮')) return '热腾腾';
    return '随便吃';
  },

  /**
   * 弹出输入框，新增美食分类
   */
  showAddCategoryDialog() {
    wx.showModal({
      title: '新增美食分类',
      placeholderText: '请输入新分类名称',
      editable: true,
      success: async (res) => {
        if (res.confirm && res.content) {
          const name = res.content.trim();
          if (!name) return;
          try {
            wx.showLoading({ title: '正在添加...' });
            const addRes = await request({
              url: '/food/categories',
              method: 'POST',
              data: { name }
            });
            wx.hideLoading();
            if (addRes.success) {
              wx.showToast({ title: '添加分类成功', icon: 'success' });
              this.fetchFoodList();
            } else {
              wx.showToast({ title: addRes.message || '添加失败', icon: 'none' });
            }
          } catch (err) {
            wx.hideLoading();
            console.error('[Recipe Page] 新增分类失败:', err);
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
   * 过滤分类美食
   */
  filterFoods() {
    const { foods, currentCategory } = this.data;
    const filteredFoods = foods.filter(item => this.getDishCategory(item) === currentCategory);
    this.setData({ filteredFoods });
  },

  /**
   * 切换分类
   */
  switchCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    if (cat === this.data.currentCategory) return;
    
    // 切换分类时清除批量状态
    const resetFoods = this.data.foods.map(item => ({ ...item, selected: false }));
    this.setData({
      currentCategory: cat,
      foods: resetFoods,
      isBatchMode: false,
      selectedCount: 0
    }, () => {
      this.filterFoods();
    });
  },

  /**
   * 切换批量管理模式
   */
  toggleBatchMode() {
    const nextMode = !this.data.isBatchMode;
    const resetFoods = this.data.foods.map(item => ({ ...item, selected: false }));
    this.setData({
      isBatchMode: nextMode,
      foods: resetFoods,
      selectedCount: 0
    }, () => {
      this.filterFoods();
    });
  },

  /**
   * 卡片点击
   */
  onCardClick(e) {
    const item = e.currentTarget.dataset.item;
    if (this.data.isBatchMode) {
      // 批量模式：勾选/取消勾选
      const updatedFoods = this.data.foods.map(food => {
        if (food.id === item.id) {
          return { ...food, selected: !food.selected };
        }
        return food;
      });
      const selectedCount = updatedFoods.filter(f => f.selected).length;
      this.setData({
        foods: updatedFoods,
        selectedCount
      }, () => {
        this.filterFoods();
      });
    } else {
      // 正常模式：点击触发编辑弹层
      this.setData({
        showModal: true,
        isEditMode: true,
        formId: item.id,
        formName: item.name,
        formTags: item.tags || '',
        formCategory: item.category,
        formCustomCategory: item.custom_category || this.getDishCategory(item)
      });
    }
  },

  /**
   * 点击图片框上传/修改照片
   */
  onUpdatePhoto(e) {
    // 批量模式下禁用图片上传触发，避免误触
    if (this.data.isBatchMode) return;

    const id = e.currentTarget.dataset.id;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0];
        
        // 我们这里把临时文件转成 base64 模拟上传 (微信没有服务器时最好的持久化方式)
        wx.getFileSystemManager().readFile({
          filePath: tempFilePath,
          encoding: 'base64',
          success: async (fileRes) => {
            const base64Image = 'data:image/png;base64,' + fileRes.data;
            const targetFood = this.data.foods.find(f => f.id === id);
            if (!targetFood) return;

            try {
              await request({
                url: `/food/${id}`,
                method: 'PUT',
                data: {
                  name: targetFood.name,
                  tags: targetFood.tags || '',
                  category: targetFood.category,
                  image_url: base64Image
                },
                showLoading: true,
                loadingMsg: '上传更新中...'
              });
              this.fetchFoodList();
            } catch (err) {
              // Mock 更新图片
              const updatedList = this.data.foods.map(f => {
                if (f.id === id) {
                  return { ...f, image_url: base64Image };
                }
                return f;
              });
              this.setData({ foods: updatedList });
              wx.setStorageSync('local_recipe_foods', updatedList);
              this.filterFoods();
              wx.showToast({ title: '已更新图片(本地)', icon: 'success' });
            }
          }
        });
      }
    });
  },

  /**
   * 弹窗操作
   */
  showAddModal() {
    this.setData({
      showModal: true,
      isEditMode: false,
      formId: null,
      formName: '',
      formTags: '',
      formCategory: 'home',
      formCustomCategory: this.data.currentCategory
    });
  },

  hideModal() {
    this.setData({
      showModal: false,
      isEditMode: false,
      formId: null,
      formName: '',
      formTags: '',
      formCategory: 'home',
      formCustomCategory: ''
    });
  },

  onInputFormName(e) {
    this.setData({ formName: e.detail.value });
  },

  onInputFormTags(e) {
    this.setData({ formTags: e.detail.value });
  },

  onCategoryChange(e) {
    this.setData({ formCategory: e.detail.value });
  },

  /**
   * 提交表单 (新增或编辑)
   */
  async submitForm() {
    const { formName, formTags, formCategory, formCustomCategory, isEditMode, formId, foods } = this.data;
    if (!formName.trim()) {
      wx.showToast({ title: '请输入美食名字哦', icon: 'none' });
      return;
    }

    const payload = {
      name: formName.trim(),
      tags: formTags.trim(),
      category: formCategory,
      custom_category: formCustomCategory
    };

    if (isEditMode) {
      try {
        await request({
          url: `/food/${formId}`,
          method: 'PUT',
          data: payload,
          showLoading: true,
          loadingMsg: '修改保存中...'
        });
        this.hideModal();
        this.fetchFoodList();
      } catch (err) {
        const updatedList = foods.map(f => {
          if (f.id === formId) {
            return { ...f, ...payload };
          }
          return f;
        });
        this.setData({ foods: updatedList });
        wx.setStorageSync('local_recipe_foods', updatedList);
        this.hideModal();
        this.filterFoods();
        wx.showToast({ title: '修改已更新(本地)', icon: 'success' });
      }
    } else {
      try {
        await request({
          url: '/food',
          method: 'POST',
          data: payload,
          showLoading: true,
          loadingMsg: '添加美食中...'
        });
        this.hideModal();
        this.fetchFoodList();
      } catch (err) {
        const newFood = {
          id: Date.now(),
          name: formName.trim(),
          tags: formTags.trim(),
          category: formCategory,
          custom_category: formCustomCategory,
          image_url: ''
        };
        const newList = [newFood, ...foods];
        this.setData({ foods: newList });
        wx.setStorageSync('local_recipe_foods', newList);
        this.hideModal();
        this.filterFoods();
        wx.showToast({ title: '新增成功(本地)', icon: 'success' });
      }
    }
  },

  /**
   * 批量删除已选美食
   */
  async deleteSelectedFoods() {
    const selectedIds = this.data.foods.filter(f => f.selected).map(f => f.id);
    if (selectedIds.length === 0) return;

    wx.showModal({
      title: '删除美味记忆',
      content: `确定要批量删除选中的 ${selectedIds.length} 道美食吗？`,
      success: async (modalRes) => {
        if (modalRes.confirm) {
          try {
            // 后端批量删除
            for (const id of selectedIds) {
              await request({
                url: `/food/${id}`,
                method: 'DELETE'
              });
            }
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.fetchFoodList();
          } catch (err) {
            // Mock 删除
            const newList = this.data.foods.filter(f => !selectedIds.includes(f.id));
            this.setData({
              foods: newList,
              isBatchMode: false,
              selectedCount: 0
            });
            wx.setStorageSync('local_recipe_foods', newList);
            this.filterFoods();
            wx.showToast({ title: '删除成功(本地)', icon: 'success' });
          }
        }
      }
    });
  }
});

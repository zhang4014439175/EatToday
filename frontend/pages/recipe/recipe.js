const { request } = require('../../utils/request');

Page({
  data: {
    foods: [],
    filteredFoods: [],
    currentCategory: 'home', // 'home' (私房菜) 或 'out' (寻宝图)
    isBatchMode: false,
    selectedCount: 0,
    
    // 弹窗表单状态
    showModal: false,
    isEditMode: false,
    formId: null,
    formName: '',
    formTags: '',
    formCategory: 'home'
  },

  onLoad() {
    this.fetchFoodList();
  },

  /**
   * 拉取所有美食数据
   */
  async fetchFoodList() {
    try {
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
        foods: processedFoods,
        isBatchMode: false,
        selectedCount: 0
      });
      this.filterFoods();
    } catch (err) {
      console.warn('[Recipe Page] 获取美食库失败，使用本地缓存或 Mock 兜底');
      // Mock 兜底
      const localFoods = wx.getStorageSync('local_recipe_foods');
      if (localFoods && localFoods.length > 0) {
        this.setData({
          foods: localFoods.map(f => ({ ...f, selected: false })),
          isBatchMode: false,
          selectedCount: 0
        });
      } else {
        const mockList = [
          { id: 1, name: '火锅 🍲', category: 'home', tags: '特色,聚会', image_url: '' },
          { id: 2, name: '烤肉 🥓', category: 'home', tags: '肉食,美味', image_url: '' },
          { id: 3, name: '螺蛳粉 🍜', category: 'home', tags: '酸辣', image_url: '' },
          { id: 4, name: '日料寿司 🍣', category: 'out', tags: '精致', image_url: '' },
          { id: 5, name: '麻辣烫 🍢', category: 'out', tags: '麻辣', image_url: '' },
          { id: 6, name: '汉堡炸鸡 🍔', category: 'out', tags: '高热量', image_url: '' }
        ];
        this.setData({
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
   * 过滤分类美食
   */
  filterFoods() {
    const { foods, currentCategory } = this.data;
    const filteredFoods = foods.filter(item => item.category === currentCategory);
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
        formCategory: item.category
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
      formCategory: this.data.currentCategory
    });
  },

  hideModal() {
    this.setData({
      showModal: false,
      isEditMode: false,
      formId: null,
      formName: '',
      formTags: '',
      formCategory: 'home'
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
    const { formName, formTags, formCategory, isEditMode, formId, foods } = this.data;
    if (!formName.trim()) {
      wx.showToast({ title: '请输入美食名字哦', icon: 'none' });
      return;
    }

    const payload = {
      name: formName.trim(),
      tags: formTags.trim(),
      category: formCategory
    };

    if (isEditMode) {
      // 编辑模式
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
        // Mock 编辑
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
      // 新增模式
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
        // Mock 新增
        const newFood = {
          id: Date.now(),
          name: formName.trim(),
          tags: formTags.trim(),
          category: formCategory,
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

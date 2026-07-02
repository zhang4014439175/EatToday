import { request } from '../../utils/request.js';
import { initSpaceSwitcher } from '../../utils/space.js';

Page({
  data: {
    activeTab: 'vote',
    eatMode: 'home', // home(在家吃) 或 out(出去吃)
    isSpinning: false,
    rotationAngle: 0,
    foodList: [], // 菜品候选池
    outFoodList: [], // 出去吃的菜品池
    wheelResult: null,
    currentSpace: null,
    
    // 伴侣与投票状态
    isPaired: false,
    userInfo: null,
    activeSession: null,
    sessionStatusText: '未开启投票',
    voteOptions: [],
    selectedVoteIds: [],
    canVote: true,
 
    // 爱心厨房状态
    kitchenSession: null,
    newDishName: '',
    dinerNote: '',
    chefNote: '',
    cookedDishPhoto: '',
    praiseNote: '',
    selectedMenuDishIndex: -1,
    categories: [
      { key: 'signature', name: '拿手菜' },
      { key: 'hot', name: '热腾腾' },
      { key: 'soup', name: '靓汤水' },
      { key: 'staple', name: '主食面' },
      { key: 'others', name: '随便吃' }
    ],
    activeCategory: 'signature',
    cart: {},
    cartCount: 0,
    cartItems: [],
    filteredDishes: [],
    showConfirmModal: false
  },

  onShow() {
    const app = getApp();
    this.setData({
      currentSpace: app.globalData.currentSpace
    });

    initSpaceSwitcher(this, () => {
      this.setData({
        kitchenSession: null,
        activeSession: null,
        selectedVoteIds: [],
        cart: {},
        cartCount: 0,
        cartItems: [],
        showConfirmModal: false
      });
      this.checkPairStatus();
      this.fetchFoodList();
    });

    this.checkPairStatus();
    this.fetchFoodList();
  },

  /**
   * 检查情侣绑定状态与活跃投票会话
   */
  async checkPairStatus() {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({ isPaired: false, activeSession: null });
      return;
    }

    try {
      const meData = await request({ url: '/auth/me' });
      const isPaired = !!(meData.user && meData.user.partner_id);
      
      this.setData({
        isPaired,
        userInfo: meData.user || null
      });

      if (meData.user && meData.user.current_space_id) {
        this.fetchActiveSession();
        this.fetchKitchenSession();
      }
    } catch (err) {
      this.setData({ kitchenSession: null });
      console.warn('[Food Page] 检查绑定状态失败:', err);
    }
  },

  async fetchFoodList() {
    try {
      const res = await request({ url: '/food' });
      const foodList = res.foods || [];
      
      const processedFoodList = foodList.map(item => {
        if (!item.category) {
          item.category = item.id <= 3 ? 'home' : 'out';
        }
        return item;
      });
      
      this.setData({
        foodList: processedFoodList,
        outFoodList: processedFoodList.filter(item => item.category === 'out')
      });
      this.updateVoteOptions(processedFoodList);
      this.refreshFilteredDishes();
    } catch (err) {
      console.warn('[Food Page] 获取美食库失败，启用 Mock 兜底');
      // Mock 兜底数据
      const mockList = [
        { id: 1, name: '火锅 🍲', category: 'home', tags: '拿手菜' },
        { id: 2, name: '烤肉 🥓', category: 'home', tags: '招牌菜' },
        { id: 3, name: '螺蛳粉 🍜', category: 'home', tags: '特色' },
        { id: 4, name: '日料寿司 🍣', category: 'out', tags: '清爽' },
        { id: 5, name: '麻辣烫 🍢', category: 'out', tags: '街边小吃' },
        { id: 6, name: '汉堡炸鸡 🍔', category: 'out', tags: '快乐肥宅' }
      ];
      this.setData({
        foodList: mockList,
        outFoodList: mockList.filter(item => item.category === 'out')
      });
      this.updateVoteOptions(mockList);
      this.refreshFilteredDishes();
    }
  },

  /**
   * 刷新投票多选列表 (只展示出去吃的美食)
   */
  updateVoteOptions(foodList) {
    const outFoods = foodList.filter(item => item.category === 'out');
    const voteOptions = outFoods.map(item => ({
      ...item,
      checked: this.data.selectedVoteIds.includes(String(item.id))
    }));
    this.setData({ voteOptions });
  },

  /**
   * 获取今日处于投票中或已锁定的会话
   */
  async fetchActiveSession() {
    try {
      const res = await request({ url: '/food/session/active' });
      if (res.session) {
        let statusText = '投票进行中...';
        let canVote = true;

        if (res.session.status === 'locked') {
          statusText = '今日菜品已锁定！';
          canVote = false;
        } else {
          // 判断当前用户是否已经投过票
          const hasVoted = res.votes && res.votes.some(v => v.user_id === this.data.userInfo?.id);
          if (hasVoted) {
            statusText = '已提交，等待对方中...';
            canVote = false;
          }
        }

        this.setData({
          activeSession: res.session,
          sessionStatusText: statusText,
          canVote
        });
      } else {
        // 如果没有活跃会话，且已配对，则自动创建一个会话以省去点击发起
        if (this.data.isPaired && !this.isCreatingSession) {
          this.isCreatingSession = true;
          console.log('[Food Page] 无活跃会话且已配对，自动创建今日投票会话');
          await this.createVoteSession();
          this.isCreatingSession = false;
        } else {
          this.setData({
            activeSession: null,
            sessionStatusText: '未开启投票',
            canVote: true
          });
        }
      }
    } catch (err) {
      console.warn('[Food Page] 获取投票会话失败:', err);
      this.isCreatingSession = false;
    }
  },

  /**
   * 切换标签页（旧入口保留兼容）
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab,
      wheelResult: null // 切换时清除上一次抽取结果
    });
  },

  /**
   * 旋转大转盘抽签
   */
  spinWheel() {
    const { outFoodList, isSpinning } = this.data;
    if (outFoodList.length < 2 || isSpinning) return;

    this.setData({
      isSpinning: true,
      wheelResult: null
    });

    const sectorCount = outFoodList.length;
    // 随机选中其中一个食物
    const selectedIndex = Math.floor(Math.random() * sectorCount);
    
    // 计算旋转目标角度
    // 1. 每扇区角度
    const sectorAngle = 360 / sectorCount;
    // 2. 指针在最顶端(270度方向)，所以顺时针旋转要对齐指针
    // 指针指向的目标扇区中心：angle = 270 - (selectedIndex * sectorAngle + sectorAngle / 2)
    const targetAngle = 270 - (selectedIndex * sectorAngle + sectorAngle / 2);
    
    // 3. 加上基础圈数 (让转盘多转几圈)
    const totalRotation = this.data.rotationAngle + (360 * 6) + targetAngle - (this.data.rotationAngle % 360);

    this.setData({
      rotationAngle: totalRotation
    });

    // 等待旋转动画结束 (3.5秒)
    setTimeout(() => {
      this.setData({
        isSpinning: false,
        wheelResult: outFoodList[selectedIndex]
      });
      wx.showToast({
        title: `抽中了：${outFoodList[selectedIndex].name}`,
        icon: 'success'
      });
    }, 3500);
  },

  /**
   * 锁定当前大转盘结果
   */
  async lockWheelResult() {
    const { wheelResult } = this.data;
    if (!wheelResult) return;

    try {
      await request({
        url: '/food/lock-wheel',
        method: 'POST',
        data: { foodId: wheelResult.id },
        showLoading: true,
        loadingMsg: '正在锁定...'
      });
      wx.showToast({
        title: '已锁定今日午/晚餐',
        icon: 'success'
      });
    } catch (err) {
      console.warn('[Food Page] 锁定失败，这可能是本地单机环境模拟成功');
    }
  },

  /**
   * 创建投票会话
   */
  async createVoteSession() {
    try {
      await request({
        url: '/food/session',
        method: 'POST',
        showLoading: true,
        loadingMsg: '创建投票中...'
      });
      this.setData({
        selectedVoteIds: [],
        voteOptions: this.data.voteOptions.map(item => ({ ...item, checked: false }))
      });
      this.fetchActiveSession();
    } catch (err) {
      // 本地 Mock 会话展示
      wx.showToast({ title: '已开启模拟投票会话', icon: 'success' });
      this.setData({
        activeSession: { id: 99, status: 'voting' },
        sessionStatusText: '投票进行中...',
        canVote: true,
        selectedVoteIds: [],
        voteOptions: this.data.voteOptions.map(item => ({ ...item, checked: false }))
      });
    }
  },

  /**
   * 处理投票多选框变化
   */
  onVoteCheckboxChange(e) {
    const selectedVoteIds = e.detail.value;
    this.setData({ selectedVoteIds });

    // 重新高亮勾选状态
    const voteOptions = this.data.voteOptions.map(item => ({
      ...item,
      checked: selectedVoteIds.includes(String(item.id))
    }));
    this.setData({ voteOptions });
  },

  /**
   * 随机帮用户勾选最多 3 个出去吃选项
   */
  randomVotePick() {
    const { voteOptions, canVote } = this.data;
    if (!canVote) return;

    if (!voteOptions.length) {
      wx.showToast({ title: '美食库还没有出去吃选项', icon: 'none' });
      return;
    }

    const shuffled = [...voteOptions].sort(() => Math.random() - 0.5);
    const selectedVoteIds = shuffled.slice(0, Math.min(3, shuffled.length)).map(item => String(item.id));
    const nextVoteOptions = voteOptions.map(item => ({
      ...item,
      checked: selectedVoteIds.includes(String(item.id))
    }));

    this.setData({
      selectedVoteIds,
      voteOptions: nextVoteOptions
    });
    wx.showToast({ title: '已随机选好啦', icon: 'success' });
  },

  /**
   * 提交投票选择
   */
  async submitVotes() {
    const { selectedVoteIds, activeSession } = this.data;
    if (selectedVoteIds.length === 0 || !activeSession) return;

    try {
      await request({
        url: `/food/session/${activeSession.id}/vote`,
        method: 'POST',
        data: { foodIds: selectedVoteIds.map(Number) },
        showLoading: true,
        loadingMsg: '正在提交选择...'
      });
      wx.showToast({ title: '提交成功！', icon: 'success' });
      this.fetchActiveSession();
    } catch (err) {
      // 本地模拟选菜成功的兜底展示
      wx.showToast({ title: '模拟提交成功', icon: 'success' });
      this.setData({
        canVote: false,
        sessionStatusText: '已提交，等待对方中...'
      });
      
      // 3秒后自动模拟伴侣也投完并出结果的场景
      setTimeout(() => {
        const intersectionFood = this.data.foodList.find(f => selectedVoteIds.includes(String(f.id)));
        const finalFood = intersectionFood || this.data.foodList[Math.floor(Math.random() * this.data.foodList.length)];
        
        this.setData({
          activeSession: {
            id: 99,
            status: 'locked',
            selected_food_name: finalFood.name,
            result_reason: intersectionFood ? 'intersection' : 'random'
          },
          sessionStatusText: '今日菜品已锁定！'
        });
      }, 3000);
    }
  },

  /**
   * 管理：输入框输入菜名
   */
  onInputFoodName(e) {
    this.setData({ newFoodName: e.detail.value });
  },

  /**
   * 跳转到独立美食之书二级页面
   */
  goToRecipeBook() {
    wx.navigateTo({
      url: '/pages/recipe/recipe'
    });
  },

  goToProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  /**
   * 厨房：获取活跃会话
   */
  async fetchKitchenSession() {
    try {
      const res = await request({ url: '/kitchen/active' });
      this.setData({ kitchenSession: res.session || null });
    } catch (err) {
      this.setData({ kitchenSession: null });
      console.log('[Food Page] 暂无活跃下厨订单/模拟环境');
    }
  },

  /**
   * 厨房：选择已点菜品
   */
  selectMenuDish(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      selectedMenuDishIndex: index,
      newDishName: this.data.foodList[index].name
    });
  },

  /**
   * 厨房：点菜自定义名称输入
   */
  onInputDishName(e) {
    this.setData({
      newDishName: e.detail.value,
      selectedMenuDishIndex: -1 // 自定义输入时取消菜单选中
    });
  },

  /**
   * 厨房：点菜备注输入
   */
  onInputDinerNote(e) {
    this.setData({ dinerNote: e.detail.value });
  },

  /**
   * 厨房：大厨留言输入
   */
  onInputChefNote(e) {
    this.setData({ chefNote: e.detail.value });
  },

  /**
   * 厨房：评价输入
   */
  onInputPraiseNote(e) {
    this.setData({ praiseNote: e.detail.value });
  },

  /**
   * 厨房：向伴侣下单
   */
  async orderDish() {
    const { newDishName, dinerNote, userInfo } = this.data;
    const finalDishName = newDishName.trim();
    if (!finalDishName) {
      wx.showToast({ title: '请输入或选择菜名', icon: 'none' });
      return;
    }

    try {
      await request({
        url: '/kitchen/order',
        method: 'POST',
        data: { dishName: finalDishName, dinerNote },
        showLoading: true
      });
      this.fetchKitchenSession();
    } catch (err) {
      // Mock 下单
      const mockSession = {
        id: Date.now(),
        dish_name: finalDishName,
        diner_id: userInfo?.id || 1,
        chef_id: 999, // 伴侣 Mock ID
        diner_note: dinerNote,
        status: 'ordered',
        chef_note: '',
        image_url: '',
        praise: '',
        created_at: new Date().toISOString()
      };
      this.setData({
        kitchenSession: mockSession,
        newDishName: '',
        dinerNote: '',
        selectedMenuDishIndex: -1
      });
      wx.showToast({ title: '订单已发送', icon: 'success' });
      this.autoSimulatePartnerCooking();
    }
  },

  /**
   * 厨房：撤销订单
   */
  async cancelOrder() {
    try {
      await request({ url: '/kitchen/reset', method: 'POST', showLoading: true });
      this.setData({ kitchenSession: null });
    } catch (err) {
      this.setData({ kitchenSession: null });
      wx.showToast({ title: '订单已取消', icon: 'success' });
    }
  },

  /**
   * 厨房：接受掌勺
   */
  async acceptCook() {
    try {
      await request({ url: '/kitchen/accept', method: 'POST', showLoading: true });
      this.fetchKitchenSession();
    } catch (err) {
      const session = { ...this.data.kitchenSession, status: 'cooking' };
      this.setData({ kitchenSession: session });
      wx.showToast({ title: '已接受，开始烹饪', icon: 'success' });
    }
  },

  /**
   * 厨房：拍照上传成品
   */
  chooseDishPhoto() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ cookedDishPhoto: res.tempFilePaths[0] });
      }
    });
  },

  /**
   * 厨房：起锅装盘
   */
  async serveCook() {
    const { chefNote, cookedDishPhoto, kitchenSession } = this.data;
    try {
      await request({
        url: '/kitchen/serve',
        method: 'POST',
        data: { chefNote, imageUrl: cookedDishPhoto },
        showLoading: true
      });
      this.fetchKitchenSession();
    } catch (err) {
      const session = {
        ...kitchenSession,
        status: 'served',
        chef_note: chefNote || '大功告成，爱心餐点出锅啦！',
        image_url: cookedDishPhoto || ''
      };
      this.setData({
        kitchenSession: session,
        chefNote: '',
        cookedDishPhoto: ''
      });
      wx.showToast({ title: '已起锅装盘！', icon: 'success' });
      this.autoSimulatePartnerEating();
    }
  },

  /**
   * 厨房：吃饱评价
   */
  async praiseCook() {
    const { praiseNote, kitchenSession } = this.data;
    try {
      await request({
        url: '/kitchen/praise',
        method: 'POST',
        data: { praise: praiseNote },
        showLoading: true
      });
      this.fetchKitchenSession();
    } catch (err) {
      const session = {
        ...kitchenSession,
        status: 'eaten',
        praise: praiseNote || '超级美味，大厨辛苦啦！❤️'
      };
      this.setData({
        kitchenSession: session,
        praiseNote: ''
      });
      wx.showToast({ title: '送上夸夸好评！', icon: 'success' });
    }
  },

  /**
   * 厨房：结束重置会话
   */
  async resetKitchen() {
    try {
      await request({ url: '/kitchen/reset', method: 'POST', showLoading: true });
      this.setData({ kitchenSession: null });
    } catch (err) {
      this.setData({ kitchenSession: null });
    }
  },

  /**
   * 自动模拟伴侣下厨接单行为 (Mock 演示专用)
   */
  autoSimulatePartnerCooking() {
    if (this.data.currentSpace?.type === 'solo') return; // 个人空间无需模拟对方接单
    setTimeout(() => {
      const { kitchenSession } = this.data;
      if (kitchenSession && kitchenSession.status === 'ordered') {
        const session = { ...kitchenSession, status: 'cooking' };
        this.setData({ kitchenSession: session });
        wx.showModal({
          title: '🍳 大厨接单',
          content: '对方已经看到您的点单需求，开始在厨房为您忙碌啦！',
          showCancel: false
        });
      }
    }, 4000);
  },

  /**
   * 自动模拟对方吃完好评行为 (Mock 演示专用)
   */
  autoSimulatePartnerEating() {
    if (this.data.currentSpace?.type === 'solo') return; // 个人空间无需模拟对方品尝
    setTimeout(() => {
      const { kitchenSession } = this.data;
      if (kitchenSession && kitchenSession.status === 'served') {
        const session = {
          ...kitchenSession,
          status: 'eaten',
          praise: '简直是人间美味！下厨辛苦啦，给你一百个赞！❤️'
        };
        this.setData({ kitchenSession: session });
        wx.showModal({
          title: '😋 评价反馈',
          content: '对方尝过你做的饭了！发来好评：“简直是人间美味！下厨辛苦啦，给你一百个赞！”',
          showCancel: false
        });
      }
    }, 4000);
  },
 
  /**
   * 切换就餐模式 (在家吃 🏡 vs 出去吃 🚗)
   */
  switchEatMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      eatMode: mode,
      activeTab: mode === 'out' ? 'vote' : this.data.activeTab,
      wheelResult: mode === 'out' ? null : this.data.wheelResult
    });
  },
 
  /**
   * 联动：将出去吃的美食结果一键转换为约会/今日计划行程
   */
  async convertToDatePlan(e) {
    const dish = e.currentTarget.dataset.dish;
    const title = `💞 吃大餐：${dish} 🍽️`;
    const todayDate = new Date().toISOString().slice(0, 10);
    const meetingTime = `${todayDate} 18:00`;
    
    try {
      await request({
        url: '/date',
        method: 'POST',
        data: {
          title,
          meetingTime,
          meetingLocation: '特色餐馆/待定',
          notes: '由今日美食决策一键联动生成。',
          status: 'accepted'
        },
        showLoading: true,
        loadingMsg: '正在同步去哪玩行程...'
      });
      wx.showModal({
        title: '📌 联动成功',
        content: `已成功列入今日去哪玩计划！`,
        confirmText: '去查看',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/date/date' });
          }
        }
      });
    } catch (err) {
      // Mock 环境联动逻辑
      wx.showModal({
        title: '📌 模拟同步成功',
        content: `（Mock 环境）已成功列入今天的去哪玩行程！`,
        confirmText: '去查看',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/date/date' });
          }
        }
      });
    }
  },

  /**
   * 自动判定菜肴所属标签分类
   */
  getDishCategory(dish) {
    const name = dish.name || '';
    const tags = ((dish.tags || '') + name).toLowerCase();
    if (tags.includes('拿手') || tags.includes('招牌') || tags.includes('推荐') || dish.id <= 3) return 'signature';
    if (tags.includes('汤') || tags.includes('水') || tags.includes('煲')) return 'soup';
    if (tags.includes('面') || tags.includes('饭') || tags.includes('粉') || tags.includes('主食')) return 'staple';
    if (tags.includes('热') || tags.includes('炒') || tags.includes('肉') || tags.includes('辣') || tags.includes('川') || tags.includes('火锅') || tags.includes('烤') || tags.includes('炸') || tags.includes('煮')) return 'hot';
    return 'others';
  },

  /**
   * 根据当前选中的分类重新筛选右栏菜品，并附带购物车数量
   */
  refreshFilteredDishes() {
    const { foodList, activeCategory, cart } = this.data;
    const filteredDishes = foodList
      .filter(item => item.category === 'home' && this.getDishCategory(item) === activeCategory)
      .map(item => ({
        ...item,
        quantity: cart[item.id] || 0
      }));
    this.setData({ filteredDishes });
  },

  /**
   * 选择左栏菜单分类
   */
  selectCategory(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ activeCategory: category });
    this.refreshFilteredDishes();
  },

  /**
   * 购物车加减按钮处理
   */
  changeCartQuantity(e) {
    const id = e.currentTarget.dataset.id;
    const action = e.currentTarget.dataset.action;
    const cart = { ...this.data.cart };

    if (action === 'plus') {
      cart[id] = (cart[id] || 0) + 1;
    } else if (action === 'minus') {
      if (cart[id] > 0) {
        cart[id]--;
        if (cart[id] === 0) {
          delete cart[id];
        }
      }
    }

    this.setData({ cart });
    this.recalculateCart();
  },

  /**
   * 重新计算购物车数值
   */
  recalculateCart() {
    const { cart, foodList } = this.data;
    let cartCount = 0;
    const cartItems = [];

    Object.keys(cart).forEach(idKey => {
      const id = Number(idKey);
      const qty = cart[idKey];
      const dish = foodList.find(item => item.id === id);
      if (dish && qty > 0) {
        cartCount += qty;
        cartItems.push({
          ...dish,
          quantity: qty
        });
      }
    });

    this.setData({
      cartCount,
      cartItems
    });
    this.refreshFilteredDishes();
  },

  /**
   * 控制收银台确认弹层
   */
  showOrderModal() {
    this.setData({ showConfirmModal: true });
  },
  hideOrderModal() {
    this.setData({ showConfirmModal: false });
  },

  /**
   * 确认并向伴侣发送爱心菜单订单
   */
  async submitCartOrder() {
    const { cartItems, dinerNote } = this.data;
    if (cartItems.length === 0) return;

    // 将多菜品购物车扁平化为逗号隔开的单字符串
    const dishName = cartItems.map(item => `${item.name} x${item.quantity}`).join('、');

    try {
      const res = await request({
        url: '/kitchen/order',
        method: 'POST',
        data: {
          dish_name: dishName,
          diner_note: dinerNote
        },
        showLoading: true,
        loadingMsg: '正在发送点单...'
      });
      this.setData({
        kitchenSession: res.session,
        cart: {},
        cartCount: 0,
        cartItems: [],
        showConfirmModal: false,
        dinerNote: ''
      });
      this.refreshFilteredDishes();
      this.autoSimulatePartnerCooking();
    } catch (err) {
      // Mock 下单
      const session = {
        id: Date.now(),
        dish_name: dishName,
        diner_id: this.data.userInfo ? this.data.userInfo.id : 1,
        chef_id: 999,
        diner_note: dinerNote,
        status: 'ordered',
        chef_note: '',
        image_url: '',
        praise: '',
        created_at: new Date().toISOString()
      };
      this.setData({
        kitchenSession: session,
        cart: {},
        cartCount: 0,
        cartItems: [],
        showConfirmModal: false,
        dinerNote: ''
      });
      this.refreshFilteredDishes();
      this.autoSimulatePartnerCooking();
    }
  }
});

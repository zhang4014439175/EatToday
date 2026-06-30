import { request } from '../../utils/request.js';

Page({
  data: {
    activeTab: 'wheel', // wheel 或 vote
    isSpinning: false,
    rotationAngle: 0,
    newFoodName: '',
    foodList: [], // 菜品候选池
    wheelResult: null,
    
    // 伴侣与投票状态
    isPaired: false,
    userInfo: null,
    activeSession: null,
    sessionStatusText: '未开启投票',
    voteOptions: [],
    selectedVoteIds: [],
    canVote: true
  },

  onShow() {
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

      if (isPaired) {
        this.fetchActiveSession();
      }
    } catch (err) {
      console.warn('[Food Page] 检查绑定状态失败:', err);
    }
  },

  /**
   * 获取我们当前的食物库
   */
  async fetchFoodList() {
    try {
      const res = await request({ url: '/food' });
      const foodList = res.foods || [];
      this.setData({ foodList });
      this.updateVoteOptions(foodList);
    } catch (err) {
      console.warn('[Food Page] 获取美食库失败，启用 Mock 兜底');
      // Mock 兜底数据
      const mockList = [
        { id: 1, name: '火锅 🍲' },
        { id: 2, name: '烤肉 🥓' },
        { id: 3, name: '螺蛳粉 🍜' },
        { id: 4, name: '日料寿司 🍣' },
        { id: 5, name: '麻辣烫 🍢' },
        { id: 6, name: '汉堡炸鸡 🍔' }
      ];
      this.setData({ foodList: mockList });
      this.updateVoteOptions(mockList);
    }
  },

  /**
   * 刷新投票多选列表
   */
  updateVoteOptions(foodList) {
    const voteOptions = foodList.map(item => ({
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
        this.setData({
          activeSession: null,
          sessionStatusText: '未开启投票',
          canVote: true
        });
      }
    } catch (err) {
      console.warn('[Food Page] 获取投票会话失败:', err);
    }
  },

  /**
   * 切换标签页 (随机轮盘 / 双人盲盒)
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
    const { foodList, isSpinning } = this.data;
    if (foodList.length < 2 || isSpinning) return;

    this.setData({
      isSpinning: true,
      wheelResult: null
    });

    const sectorCount = foodList.length;
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
        wheelResult: foodList[selectedIndex]
      });
      wx.showToast({
        title: `抽中了：${foodList[selectedIndex].name}`,
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
      this.setData({ selectedVoteIds: [] });
      this.fetchActiveSession();
    } catch (err) {
      // 本地 Mock 会话展示
      wx.showToast({ title: '已开启模拟投票会话', icon: 'success' });
      this.setData({
        activeSession: { id: 99, status: 'voting' },
        sessionStatusText: '投票进行中...',
        canVote: true,
        selectedVoteIds: []
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
   * 管理：添加美食到库
   */
  async addFood() {
    const { newFoodName } = this.data;
    if (!newFoodName.trim()) return;

    try {
      await request({
        url: '/food',
        method: 'POST',
        data: { name: newFoodName },
        showLoading: true,
        loadingMsg: '正在添加...'
      });
      this.setData({ newFoodName: '' });
      this.fetchFoodList();
    } catch (err) {
      // Mock 添加
      const newList = [...this.data.foodList, { id: Date.now(), name: newFoodName }];
      this.setData({
        foodList: newList,
        newFoodName: ''
      });
      this.updateVoteOptions(newList);
      wx.showToast({ title: '已添加到本地列表', icon: 'success' });
    }
  },

  /**
   * 管理：从库中删除美食
   */
  async deleteFood(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await request({
        url: `/food/${id}`,
        method: 'DELETE',
        showLoading: true,
        loadingMsg: '正在删除...'
      });
      this.fetchFoodList();
    } catch (err) {
      // Mock 删除
      const newList = this.data.foodList.filter(item => item.id !== id);
      this.setData({ foodList: newList });
      this.updateVoteOptions(newList);
      wx.showToast({ title: '已从本地列表移除', icon: 'success' });
    }
  },

  goToProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  }
});

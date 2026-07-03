import { request } from '../../utils/request.js';
import { login, logout } from '../../utils/auth.js';
import { createSpace, joinSpace, switchSpace, getMySpaces, getCurrentSpace, leaveSpace, initSpaceSwitcher } from '../../utils/space.js';

Page({
  data: {
    isLogin: false,
    userInfo: null,
    currentSpace: null,
    spaces: [],
    spaceMembers: [],
    activeTab: 'join', // 'join' | 'create'
    inputSpaceCode: '',
    inputSpaceName: '',
    
    // 纪念日管理
    showAddAnniversary: false,
    newAnniversary: {
      title: '',
      date: '',
      is_yearly: true
    },
    anniversaries: [],
    
    // 设置项
    settings: {
      dateNotify: true,
      foodNotify: true
    }
  },

  onShow() {
    this.checkLoginState();
    initSpaceSwitcher(this, () => {
      this.checkLoginState();
    });
  },

  /**
   * 检查当前的本地登录态
   */
  checkLoginState() {
    const token = wx.getStorageSync('token');
    if (token) {
      this.setData({ isLogin: true });
      this.loadProfileData();
    } else {
      this.setData({
        isLogin: false,
        userInfo: null,
        currentSpace: null,
        spaces: [],
        spaceMembers: [],
        anniversaries: []
      });
    }
  },

  /**
   * 触发一键登录/注册
   */
  async handleLogin() {
    try {
      // 随机分配一个可爱的微信昵称，用于演示
      const names = [
        '小甜甜', '大魔王', '小憨包', '干饭第一名', '猫系女友', '犬系男友',
        '芝士小面包', '快乐肥宅', '吃货本体', '元气少女', '小考拉', '小熊猫',
        '奶茶守护者', '火锅终结者', '干饭之魂', '熬夜冠军', '咸鱼翻身', '摸鱼大师'
      ];
      const randomName = names[Math.floor(Math.random() * names.length)];
      
      const user = await login(randomName, '');
      wx.showToast({ title: '登录成功！', icon: 'success' });
      
      this.setData({ isLogin: true });
      this.loadProfileData();
    } catch (err) {
      console.error('[Profile Page] 登录失败:', err);
    }
  },

  /**
   * 载入个人空间与群组空间数据，以及纪念日列表
   */
  async loadProfileData() {
    try {
      // 1. 获取最新用户信息
      const meData = await request({ url: '/auth/me' });
      const { user } = meData;

      // 2. 获取我加入的全部空间列表
      const spaces = await getMySpaces();

      // 3. 获取当前空间成员与详细信息
      let currentSpace = null;
      let spaceMembers = [];
      try {
        const spaceData = await getCurrentSpace();
        currentSpace = spaceData.space;
        spaceMembers = spaceData.members;
      } catch (spaceErr) {
        console.error('获取活跃空间详情失败，尝试使用本地缓存', spaceErr);
        const cachedSpace = wx.getStorageSync('currentSpace');
        if (cachedSpace) {
          currentSpace = JSON.parse(cachedSpace);
        }
      }

      this.setData({
        userInfo: user,
        spaces,
        currentSpace,
        spaceMembers
      });


    } catch (err) {
      console.warn('[Profile Page] 拉取线上空间数据失败，启用本地 Mock');
      const mockUser = {
        id: 1,
        nickname: '本地测试用户',
        pair_code: 'LOV520',
        avatar_url: ''
      };
      const mockSpace = { id: 1, name: '本地模拟空间', code: 'ABCDEF', type: 'group' };
      const mockMembers = [
        { id: 1, nickname: '本地测试用户', avatar_url: '', role: 'admin' },
        { id: 2, nickname: '模拟好友', avatar_url: '', role: 'member' }
      ];
      this.setData({
        userInfo: mockUser,
        currentSpace: mockSpace,
        spaceMembers: mockMembers,
        spaces: [mockSpace]
      });
    }
  },

  /**
   * 阻止冒泡的辅助函数
   */
  dummy() {},

  /**
   * 复制当前活跃空间的邀请码
   */
  copySpaceCode() {
    const code = this.data.currentSpace?.code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '邀请码已复制', icon: 'success' });
      }
    });
  },

  /**
   * 弹出式新建双人空间
   */
  handleCreateSpacePopup() {
    wx.showModal({
      title: '新建空间',
      placeholderText: '请输入空间名称 (最多2人)',
      editable: true,
      success: async (res) => {
        if (res.confirm && res.content) {
          const name = res.content.trim();
          if (!name) return;
          try {
            wx.showLoading({ title: '正在创建...' });
            await createSpace(name);
            wx.hideLoading();
            wx.showToast({ title: '空间创建成功', icon: 'success' });
            this.loadProfileData();
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '创建空间失败', icon: 'none' });
          }
        }
      }
    });
  },

  /**
   * 弹出式加入已有空间
   */
  handleJoinSpacePopup() {
    wx.showModal({
      title: '加入已有空间',
      placeholderText: '请输入6位邀请码',
      editable: true,
      success: async (res) => {
        if (res.confirm && res.content) {
          const code = res.content.trim().toUpperCase();
          if (!code) return;
          try {
            wx.showLoading({ title: '正在加入...' });
            await joinSpace(code);
            wx.hideLoading();
            wx.showToast({ title: '成功加入空间', icon: 'success' });
            this.loadProfileData();
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '加入空间失败', icon: 'none' });
          }
        }
      }
    });
  },

  /**
   * 用户点击分享，支持分享邀请卡片
   */
  onShareAppMessage(res) {
    if (res.from === 'button') {
      const userInfo = this.data.userInfo || {};
      const currentSpace = this.data.currentSpace || {};
      if (res.target.dataset.type === 'invite-double') {
        return {
          title: `${userInfo.nickname || '我'} 邀请你一起建立双人共享空间，一起规划吃什么去哪玩！`,
          path: `/pages/home/home?inviteSenderId=${userInfo.id}&inviteSenderName=${encodeURIComponent(userInfo.nickname || '用户')}`,
        };
      } else if (res.target.dataset.type === 'invite-to-space') {
        return {
          title: `${userInfo.nickname || '我'} 邀请你加入共享空间「${currentSpace.name || '我们的空间'}」！`,
          path: `/pages/home/home?inviteSpaceCode=${currentSpace.code}&inviteSpaceName=${encodeURIComponent(currentSpace.name || '空间')}`,
        };
      }
    }
    return {
      title: '今天吃什么？去哪玩？好友共同协作决策小助手',
      path: '/pages/home/home'
    };
  },

  /**
   * 快速切换空间
   */
  async handleSwitchSpace(e) {
    const spaceId = e.currentTarget.dataset.id;
    if (spaceId === this.data.currentSpace?.id) return;

    try {
      await switchSpace(spaceId);
      wx.showToast({ title: '空间已切换', icon: 'success' });
      this.loadProfileData();
    } catch (err) {
      wx.showToast({ title: err.message || '切换空间失败', icon: 'none' });
    }
  },

  // --- 纪念日簿跳转 ---
  goToAnniversaryBook() {
    wx.navigateTo({
      url: '/pages/anniversary/anniversary'
    });
  },

  goToMemoManager() {
    wx.navigateTo({
      url: '/pages/memo/memo'
    });
  },

  /**
   * 退出当前所选空间
   */
  handleLeaveCurrentSpace() {
    const space = this.data.currentSpace;
    if (!space || space.type === 'solo') return;

    wx.showModal({
      title: '退出空间',
      content: `确认要退出群组空间「${space.name}」吗？退出后，如果该空间没有其他成员，它将被彻底删除。`,
      confirmColor: '#ff3333',
      success: async (res) => {
        if (res.confirm) {
          try {
            await leaveSpace(space.id);
            wx.showToast({ title: '已成功退出空间', icon: 'success' });
            this.loadProfileData();
          } catch (err) {
            wx.showToast({ title: err.message || '退出空间失败', icon: 'none' });
          }
        }
      }
    });
  },



  // --- 设置开关触发器 ---

  toggleDateNotify(e) {
    this.setData({ 'settings.dateNotify': e.detail.value });
    wx.showToast({ title: '设置已保存', icon: 'none' });
  },

  toggleFoodNotify(e) {
    this.setData({ 'settings.foodNotify': e.detail.value });
    wx.showToast({ title: '设置已保存', icon: 'none' });
  },

  /**
   * 修改个人昵称
   */
  editNickname() {
    const currentNickname = this.data.userInfo.nickname || '';
    wx.showModal({
      title: '修改个人昵称',
      editable: true,
      placeholderText: '请输入新昵称',
      content: currentNickname,
      success: async (res) => {
        if (res.confirm && res.content.trim()) {
          const newName = res.content.trim();
          if (newName === currentNickname) return;
          
          try {
            wx.showLoading({ title: '修改中...' });
            const updateRes = await request({
              url: '/auth/update-profile',
              method: 'POST',
              data: { nickname: newName }
            });
            wx.showToast({ title: '修改成功', icon: 'success' });
            this.setData({ 'userInfo.nickname': newName });
            
            // 同步更新全局及缓存
            const app = getApp();
            if (app) app.globalData.userInfo = updateRes.user;
            wx.setStorageSync('userInfo', JSON.stringify(updateRes.user));
          } catch (err) {
            wx.showToast({ title: err.message || '修改失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  /**
   * 选择微信头像进行上传
   */
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) return;

    wx.getFileSystemManager().readFile({
      filePath: avatarUrl,
      encoding: 'base64',
      success: async (res) => {
        const base64 = res.data;
        try {
          wx.showLoading({ title: '上传头像中...' });
          const updateRes = await request({
            url: '/auth/upload-avatar',
            method: 'POST',
            data: { avatarBase64: base64 }
          });
          wx.showToast({ title: '更换头像成功', icon: 'success' });
          this.setData({ 'userInfo.avatar_url': updateRes.avatarUrl });
          
          // 同步更新全局及缓存
          const app = getApp();
          if (app) app.globalData.userInfo = updateRes.user;
          wx.setStorageSync('userInfo', JSON.stringify(updateRes.user));
        } catch (err) {
          wx.showToast({ title: err.message || '上传头像失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
      fail: (err) => {
        wx.showToast({ title: '读取头像文件失败', icon: 'none' });
      }
    });
  },

  /**
   * 退出登录
   */
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          logout();
          this.checkLoginState();
        }
      }
    });
  },

  /**
   * 注销账号 (删除用户自身所有数据，重归新用户状态)
   */
  handleDeleteAccount() {
    wx.showModal({
      title: '⚠️ 警告：注销账号',
      content: '注销后，您的所有点单记录、日常日程、个人空间都将被彻底删除且不可恢复！确定注销吗？',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '最后确认',
            content: '注销操作是不可逆的。确认立即销毁账号并作为新用户重新开始？',
            confirmColor: '#FF4D4F',
            success: async (doubleCheck) => {
              if (doubleCheck.confirm) {
                try {
                  wx.showLoading({ title: '注销中...' });
                  await request({
                    url: '/auth/delete-account',
                    method: 'POST'
                  });
                  wx.showToast({ title: '账号已注销', icon: 'success' });
                  
                  // 本地清空状态并重新检查
                  logout();
                  this.checkLoginState();
                } catch (err) {
                  wx.showToast({ title: err.message || '注销失败', icon: 'none' });
                } finally {
                  wx.hideLoading();
                }
              }
            }
          });
        }
      }
    });
  }
});

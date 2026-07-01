import { API_BASE_URL, WS_URL } from './utils/config.js';

App({
  // 全局共享数据
  globalData: {
    // 本地开发后端 API 地址，如果部署到云服务器需改为 HTTPS 域名
    baseUrl: API_BASE_URL,
    // WebSocket 服务器连接地址
    wsUrl: WS_URL,
    // 登录凭证 token
    token: '',
    // 当前登录用户信息
    userInfo: null,
    // 绑定的伴侣用户信息
    partnerInfo: null,
    // 当前活跃空间
    currentSpace: null,
    // 加入的空间列表
    spaces: []
  },

  onLaunch() {
    console.log('EatToday Mini Program Launching...');
    
    // 启动时自动从微信本地缓存加载 Token 和空间
    try {
      const token = wx.getStorageSync('token');
      if (token) {
        this.globalData.token = token;
        console.log('[App] 从缓存成功恢复 Token');
      }

      const currentSpace = wx.getStorageSync('currentSpace');
      if (currentSpace) {
        this.globalData.currentSpace = JSON.parse(currentSpace);
        console.log('[App] 从缓存成功恢复 Space');
      }
    } catch (e) {
      console.error('[App] 获取本地缓存失败', e);
    }
  }
});

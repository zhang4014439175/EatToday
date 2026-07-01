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
    partnerInfo: null
  },

  onLaunch() {
    console.log('EatToday Mini Program Launching...');
    
    // 启动时自动从微信本地缓存加载 Token
    try {
      const token = wx.getStorageSync('token');
      if (token) {
        this.globalData.token = token;
        console.log('[App] 从缓存成功恢复 Token');
      }
    } catch (e) {
      console.error('[App] 获取本地缓存 Token 失败', e);
    }
  }
});

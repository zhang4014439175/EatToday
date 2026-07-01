import { request } from './request.js';

/**
 * 微信一键登录并保存登录态
 * @param {string} [nickname] 用户昵称
 * @param {string} [avatarUrl] 用户头像链接
 * @returns {Promise<object>} 返回登录成功的用户信息
 */
export function login(nickname = '', avatarUrl = '') {
  return new Promise((resolve, reject) => {
    // 1. 获取微信临时登录凭证 code
    wx.login({
      success: (res) => {
        if (res.code) {
          console.log('[Auth] 微信登录成功，获取到 code:', res.code);
          
          // 2. 发送 code 到我们自己的后端服务器进行注册/登录
          request({
            url: '/auth/login',
            method: 'POST',
            data: {
              code: res.code,
              nickname,
              avatarUrl
            },
            showLoading: true,
            loadingMsg: '正在登录...'
          }).then(data => {
            const { token, user, currentSpace } = data;
            
            // 3. 将登录状态保存至本地缓存及全局 globalData
            const app = getApp();
            if (app) {
              app.globalData.token = token;
              app.globalData.userInfo = user;
              app.globalData.currentSpace = currentSpace || null;
              if (user.partner_id) {
                app.globalData.partnerInfo = { id: user.partner_id }; // 占位，后面可通过 /auth/me 获取完整信息
              }
            }

            wx.setStorageSync('token', token);
            wx.setStorageSync('userInfo', JSON.stringify(user));
            if (currentSpace) {
              wx.setStorageSync('currentSpace', JSON.stringify(currentSpace));
            } else {
              wx.removeStorageSync('currentSpace');
            }
            
            console.log('[Auth] 账户成功登录并建立会话:', user.nickname);
            resolve(user);
          }).catch(err => {
            console.error('[Auth] 后端登录验证失败:', err);
            reject(err);
          });

        } else {
          console.error('[Auth] 微信登录失败，未返回 code:', res.errMsg);
          reject(new Error(res.errMsg));
        }
      },
      fail: (err) => {
        // 如果在非微信环境 (例如浏览器模拟运行) wx.login 会报错，我们在此提供 Mock 机制兼容测试
        console.warn('[Auth] 调用 wx.login 失败，触发本地 Mock 登录兜底:', err);
        const randomMockCode = `mock_code_${Math.random().toString(36).substring(2, 8)}`;
        
        request({
          url: '/auth/login',
          method: 'POST',
          data: {
            code: randomMockCode,
            nickname: nickname || '模拟测试用户',
            avatarUrl: avatarUrl || ''
          },
          showLoading: true,
          loadingMsg: '模拟登录中...'
        }).then(data => {
          const { token, user, currentSpace } = data;
          const app = getApp();
          if (app) {
            app.globalData.token = token;
            app.globalData.userInfo = user;
            app.globalData.currentSpace = currentSpace || null;
          }
          wx.setStorageSync('token', token);
          wx.setStorageSync('userInfo', JSON.stringify(user));
          if (currentSpace) {
            wx.setStorageSync('currentSpace', JSON.stringify(currentSpace));
          } else {
            wx.removeStorageSync('currentSpace');
          }
          resolve(user);
        }).catch(mockErr => {
          reject(mockErr);
        });
      }
    });
  });
}

/**
 * 退出登录并清理本地缓存
 */
export function logout() {
  const app = getApp();
  if (app) {
    app.globalData.token = '';
    app.globalData.userInfo = null;
    app.globalData.partnerInfo = null;
    app.globalData.currentSpace = null;
    app.globalData.spaces = [];
  }
  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');
  wx.removeStorageSync('partnerInfo');
  wx.removeStorageSync('currentSpace');
  
  console.log('[Auth] 已成功退出登录并清理本地缓存');
  
  wx.showToast({
    title: '已退出登录',
    icon: 'success'
  });
}

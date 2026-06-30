import { API_BASE_URL, USE_MOCK } from './config.js';
import { mockRequest } from '../mock/index.js';

const app = getApp();

/**
 * 封装微信的网络请求 (wx.request)
 * @param {object} options 请求配置项
 * @param {string} options.url 请求的相对路径（如 '/auth/login'）
 * @param {string} [options.method='GET'] 请求方法
 * @param {object} [options.data] 请求参数
 * @param {boolean} [options.showLoading=false] 是否显示加载中弹窗
 * @param {string} [options.loadingMsg='加载中...'] 加载中提示文本
 * @returns {Promise<any>}
 */
export function request(options) {
  if (USE_MOCK) {
    if (options.showLoading) {
      wx.showLoading({
        title: options.loadingMsg || '加载中...',
        mask: true
      });
    }

    return mockRequest(options)
      .then(data => {
        if (options.showLoading) {
          wx.hideLoading();
        }
        return data;
      })
      .catch(err => {
        if (options.showLoading) {
          wx.hideLoading();
        }
        wx.showToast({
          title: err.message || '操作失败',
          icon: 'none',
          duration: 2500
        });
        return Promise.reject(err);
      });
  }

  return new Promise((resolve, reject) => {
    // 获取全局 app 实例（兼容生命周期前期 app 未完全初始化好的情况）
    const currentApp = app || getApp();
    const token = currentApp ? currentApp.globalData.token : '';
    const baseUrl = currentApp ? currentApp.globalData.baseUrl : API_BASE_URL;

    if (options.showLoading) {
      wx.showLoading({
        title: options.loadingMsg || '加载中...',
        mask: true
      });
    }

    // 合并头部信息
    const header = {
      'content-type': 'application/json',
      ...options.header
    };

    if (token) {
      header['Authorization'] = `Bearer ${token}`;
    }

    wx.request({
      url: `${baseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      header: header,
      success: (res) => {
        if (options.showLoading) {
          wx.hideLoading();
        }

        // 判断 HTTP 状态码
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          resolve(res.data);
        } else if (statusCode === 401) {
          // Token 失效或未登录
          console.warn('[Request] 登录态失效，自动清理缓存并重定向');
          
          if (currentApp) {
            currentApp.globalData.token = '';
            currentApp.globalData.userInfo = null;
            currentApp.globalData.partnerInfo = null;
          }
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('partnerInfo');

          wx.showToast({
            title: '请重新登录',
            icon: 'error',
            duration: 2000
          });

          // 延迟跳转至个人中心，引导重新登录
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/profile/profile'
            });
          }, 1000);

          reject({ statusCode, message: '登录已失效，请重新登录', data: res.data });
        } else {
          // 其他 HTTP 状态码错误
          const errMsg = res.data && res.data.message ? res.data.message : '服务器开小差了';
          wx.showToast({
            title: errMsg,
            icon: 'none',
            duration: 2500
          });
          reject({ statusCode, message: errMsg, data: res.data });
        }
      },
      fail: (err) => {
        if (options.showLoading) {
          wx.hideLoading();
        }
        console.error('[Request] 请求失败:', err);
        wx.showToast({
          title: '网络连接失败，请检查网络设置',
          icon: 'none',
          duration: 3000
        });
        reject({ statusCode: 0, message: '网络请求失败', error: err });
      }
    });
  });
}

# 情侣专属规划 App (EatToday) 开发规划书

针对 2 核 2G 云服务器的资源限制，本项目采用**轻量化、省内存、易部署**的技术栈组合：
* **前端**：微信小程序原生 (TS/JS)，运行在手机端，服务器无前端运行时内存占用。
* **后端**：Node.js (Express) + `ws`，提供 REST API 与轻量级 WebSocket 实时同步。
* **数据库**：SQLite (`sqlite3` / `sqlite`)，直接读写本地文件，避免额外数据库服务常驻内存。

核心原则：
* 先完成微信登录、用户身份、配对关系，再开发依赖用户关系的业务功能。
* SQLite 开启外键、WAL、超时等待与备份策略，避免后期数据一致性问题。
* 先用稳定 REST API 跑通核心流程，WebSocket 与订阅消息作为体验增强逐步接入。
* 每个阶段都保留明确的验收标准，避免功能堆完后再集中排错。

---

## 技术架构设计

### 1. 后端基础架构
* 使用 Express 提供 REST API，统一响应结构与错误处理。
* 使用环境变量管理配置：`PORT`、`DB_PATH`、`TOKEN_SECRET`、`WECHAT_APPID`、`WECHAT_SECRET`。
* 提供 `GET /health` 健康检查接口，方便部署后探活。
* 封装认证中间件，所有用户私有接口默认需要登录凭证。
* WebSocket 连接也需要携带登录凭证，并按情侣关系加入独立房间。

### 2. 用户认证与微信登录
* 小程序端调用 `wx.login()` 获取临时 `code`。
* 后端调用微信 `code2Session` 换取 `openid`，自动创建或更新用户。
* 后端签发轻量登录凭证，小程序端后续请求自动携带。
* 用户信息更新与登录态校验独立成接口，方便后续补头像、昵称等资料。

### 3. 数据库设计 (SQLite)
在后台使用本地 `eat_today.db` 文件，建议放在 `backend/data/` 目录并加入 `.gitignore`。初始化数据库时开启：
* `PRAGMA foreign_keys = ON`
* `PRAGMA journal_mode = WAL`
* `PRAGMA busy_timeout = 5000`

核心表如下：

* **users (用户表)**:
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `openid`: TEXT UNIQUE NOT NULL
  - `pair_code`: TEXT UNIQUE NOT NULL
  - `pair_code_created_at`: TEXT
  - `nickname`: TEXT
  - `avatar_url`: TEXT
  - `partner_id`: INTEGER, REFERENCES users(id)
  - `created_at`: TEXT NOT NULL
  - `updated_at`: TEXT NOT NULL

* **anniversaries (纪念日表)**:
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `title`: TEXT NOT NULL
  - `date`: TEXT NOT NULL, 格式 `YYYY-MM-DD`
  - `date_type`: INTEGER NOT NULL DEFAULT 0, 0 公历，1 农历
  - `is_yearly`: INTEGER NOT NULL DEFAULT 0, 0 单次，1 每年重复
  - `created_by`: INTEGER NOT NULL, REFERENCES users(id)
  - `created_at`: TEXT NOT NULL
  - `updated_at`: TEXT NOT NULL

* **food_pool (点餐题库表)**:
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `name`: TEXT NOT NULL
  - `tags`: TEXT
  - `created_by`: INTEGER NOT NULL, REFERENCES users(id)
  - `created_at`: TEXT NOT NULL
  - `updated_at`: TEXT NOT NULL

* **food_sessions (点餐会话表)**:
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `created_by`: INTEGER NOT NULL, REFERENCES users(id)
  - `partner_id`: INTEGER NOT NULL, REFERENCES users(id)
  - `status`: TEXT NOT NULL, `voting` / `locked` / `cancelled`
  - `selected_food_id`: INTEGER, REFERENCES food_pool(id)
  - `result_reason`: TEXT, `intersection` / `random`
  - `created_at`: TEXT NOT NULL
  - `updated_at`: TEXT NOT NULL

* **food_votes (点餐投票表)**:
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `session_id`: INTEGER NOT NULL, REFERENCES food_sessions(id)
  - `user_id`: INTEGER NOT NULL, REFERENCES users(id)
  - `food_id`: INTEGER NOT NULL, REFERENCES food_pool(id)
  - `created_at`: TEXT NOT NULL
  - UNIQUE(`session_id`, `user_id`, `food_id`)

* **date_plans (约会行程表)**:
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `title`: TEXT NOT NULL
  - `meeting_time`: TEXT NOT NULL
  - `meeting_location`: TEXT
  - `notes`: TEXT
  - `status`: TEXT NOT NULL, `pending` / `accepted` / `rejected` / `revision_requested`
  - `revision_note`: TEXT
  - `created_by`: INTEGER NOT NULL, REFERENCES users(id)
  - `partner_id`: INTEGER NOT NULL, REFERENCES users(id)
  - `created_at`: TEXT NOT NULL
  - `updated_at`: TEXT NOT NULL

建议索引：
* `users(openid)`
* `users(pair_code)`
* `anniversaries(created_by)`
* `food_pool(created_by)`
* `food_sessions(created_by, partner_id, status)`
* `food_votes(session_id, user_id)`
* `date_plans(created_by, partner_id, status)`

### 4. 配对规则
* 配对码默认 6 位字母数字，生成时保证唯一。
* 用户不能使用自己的配对码。
* 已配对用户默认不允许再次配对，后续如需重绑应提供明确解绑流程。
* 配对操作必须在数据库事务内完成，同时更新双方 `partner_id`。
* 配对接口需要限频，避免暴力枚举配对码。

### 5. 实时互通与通知方案
* **约会审批通知**：使用微信小程序订阅消息。订阅消息需要用户主动授权，因此要提供站内红点、列表状态作为兜底。
* **点餐同步**：先通过 REST API 完成投票与结果锁定，再接入 WebSocket 做实时状态刷新。
* **WebSocket 连接管理**：鉴权、情侣房间、心跳、断线重连、重复连接清理都要在实现时考虑。

---

## 项目目录结构

规划的项目结构如下：
```
EatToday/
├── backend/                  # Node.js 后端
│   ├── package.json
│   ├── server.js             # 入口文件（Express + WebSocket）
│   ├── db.js                 # SQLite 初始化、连接与建表
│   ├── data/                 # SQLite 数据库文件目录，加入 .gitignore
│   ├── middleware/
│   │   └── auth.js           # 登录鉴权中间件
│   ├── routes/               # API 路由
│   │   ├── auth.js           # 微信登录、用户信息、配对
│   │   ├── food.js           # 食物池、投票会话、投票结果
│   │   ├── date.js           # 约会提案与状态流转
│   │   └── anniversary.js    # 纪念日管理
│   ├── services/
│   │   ├── wechat.js         # 微信 code2Session、订阅消息
│   │   └── pairing.js        # 配对码与配对事务逻辑
│   └── scripts/
│       └── ws-test.js        # WebSocket 双用户模拟脚本
└── frontend/                 # 微信小程序原生代码
    ├── app.json
    ├── app.js
    ├── pages/
    │   ├── home/             # 主页（今日概览）
    │   ├── food/             # 点餐（轮盘与双人盲盒）
    │   ├── date/             # 约会（提案与流转）
    │   └── profile/          # 个人（配对码与纪念日）
    └── utils/
        ├── request.js        # 请求封装与登录凭证携带
        └── auth.js           # 小程序登录态管理
```

---

## MVP 范围与优先级

### P0：必须先完成
* 微信登录、用户创建、登录凭证校验。
* 情侣配对码生成与双向绑定。
* 纪念日新增、列表展示、首页倒计时。
* 食物池增删改查、双人投票、结果锁定。
* 约会提案创建、接受、拒绝、修改建议。

### P1：体验增强
* WebSocket 实时同步点餐状态。
* 微信订阅消息提醒约会审批。
* 农历纪念日计算。
* 历史点餐结果与历史约会记录。

### P2：后续可选
* 图片、头像、主题皮肤。
* 更多随机玩法或标签偏好。
* 数据导出和纪念日分享卡片。

---

## 提议的开发步骤

### 第一步：后端项目初始化与数据库搭建 [进行中]
* 初始化 Node.js 项目，安装 `express`、`sqlite3`、`sqlite`、`cors`、`ws`。
* 编写 `server.js`、`db.js` 与 `GET /health`。
* 完成 SQLite 初始化、建表、索引、外键、WAL 与数据库文件目录。
* 增加 `.env.example` 和 `.gitignore`，避免数据库和密钥入库。

验收标准：
* `npm run dev` 可以启动服务。
* `GET /health` 返回正常状态。
* 首次启动自动创建数据库表。

### 第二步：微信登录与用户体系
* 小程序端接入 `wx.login()`。
* 后端实现 `POST /auth/login`，完成 `code2Session`、用户创建或更新、登录凭证签发。
* 封装后端鉴权中间件和小程序请求工具。

验收标准：
* 新用户首次登录后数据库出现用户记录。
* 小程序后续请求能自动携带登录凭证。
* 未登录访问私有接口会被拒绝。

### 第三步：情侣配对功能
* 实现配对码展示、刷新策略和配对接口。
* 使用事务完成双方 `partner_id` 双向绑定。
* 处理自我配对、重复配对、无效配对码等错误场景。

验收标准：
* 两个用户可以完成配对。
* 配对后双方都能读取到对方信息。
* 异常配对请求不会产生半绑定数据。

### 第四步：微信小程序骨架搭建
* 创建微信小程序原生 TS/JS 项目结构。
* 搭建底部 TabBar 导航：主页、点餐、约会、个人。
* 完成请求封装、登录态保存、错误提示和加载状态。

验收标准：
* 四个 Tab 可以正常切换。
* 页面启动时可以完成登录态恢复。
* API 错误能在小程序端给出可见提示。

### 第五步：个人中心与纪念日管理
* 个人页展示用户资料、配对码和伴侣状态。
* 实现纪念日新增、展示、删除或编辑。
* 首页展示恋爱天数、最近纪念日倒计时。

验收标准：
* 已配对用户能看到共同相关信息。
* 周年重复倒计时计算正确。
* 未配对用户页面有明确引导。

### 第六步：治愈点餐（轮盘与双人投票）
* 实现食物池增删改查。
* 实现点餐会话、双方各选 3 个、投票锁定与结果计算。
* 若双方选择有交集，优先从交集中选；若没有交集，从双方选择中随机选。
* 点餐结果写入 `food_sessions`，方便首页展示今日结果。
* 在 REST 流程稳定后接入 WebSocket 实时刷新。

验收标准：
* 单人和双人投票流程都能完成。
* 投票结果规则可复现、可测试。
* WebSocket 断开时 REST 轮询或手动刷新仍可使用。

### 第七步：约会计划流转
* 实现约会提案创建、列表、详情。
* 实现接受、拒绝、提出修改建议。
* 接入微信订阅消息，并保留站内状态兜底。

验收标准：
* 约会状态只能按合法路径流转。
* 修改建议内容能保存并展示。
* 未授权订阅消息时，站内仍能看到待处理约会。

### 第八步：部署、备份与上线检查
* 服务器使用 Node 运行后端，可选 `pm2` 或 `systemd` 保活。
* 使用 Nginx 配置 HTTPS，满足微信小程序合法域名与 HTTPS 要求。
* 配置日志、数据库定期备份、异常重启策略。
* 监测空闲与并发场景下的 CPU、内存和 SQLite 写入表现。

验收标准：
* 后端可通过 HTTPS 访问。
* 数据库文件有可恢复备份。
* 空闲内存占用符合轻量部署预期。

---

## 验证计划

### 自动化验证
* 编写后端集成测试覆盖：登录、配对、纪念日、点餐投票、约会状态流转。
* 编写点餐匹配算法单元测试，覆盖有交集、无交集、重复投票、未完成投票等场景。
* 编写 WebSocket 双用户模拟脚本，测试连接鉴权、房间同步和断线重连。

### 手工验证
* 使用 Postman / Curl 测试核心 API。
* 使用微信开发者工具验证登录、页面跳转、请求封装和异常提示。
* 使用两个测试用户完整走一遍配对、点餐、约会审批流程。

### 部署与性能验证
* 部署至 2 核 2G 服务器，观察空闲状态、连续请求和简单并发下的内存占用。
* 验证 SQLite WAL 文件不会无限增长，备份后可恢复。
* 检查 HTTPS、合法域名、CORS、环境变量、日志路径和数据库权限。

---

## 风险与注意事项

* 微信订阅消息必须用户主动授权，不能假设所有通知都能推送成功。
* SQLite 适合当前轻量场景，但写入需要短事务，避免长时间占用锁。
* 配对码是敏感入口，需要限频和错误提示收敛。
* 小程序上线必须配置 HTTPS 域名，开发环境和生产环境地址要分开。
* 数据库文件是核心资产，必须从第一天就准备备份和恢复流程。

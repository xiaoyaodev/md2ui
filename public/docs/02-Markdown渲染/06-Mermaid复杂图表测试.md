# Mermaid 超复杂图表压力测试

本文档用于测试 Mermaid 在极端复杂场景下的渲染能力，包含大规模节点、深层嵌套、复杂交互关系等场景。

\## 1. 大规模微服务架构流程图

模拟一个包含 30+ 节点的电商微服务架构全链路调用关系。

```mermaid
graph TB
    subgraph 客户端层
        WEB[Web 前端]
        APP[移动 App]
        H5[H5 页面]
        MINI[小程序]
    end

    subgraph 网关层
        NGINX[Nginx 负载均衡]
        GW[API Gateway]
        AUTH[鉴权中心]
        LIMIT[限流熔断]
    end

    subgraph 业务服务层
        subgraph 用户域
            USER_SVC[用户服务]
            MEMBER_SVC[会员服务]
            ADDR_SVC[地址服务]
        end
        subgraph 商品域
            PRODUCT_SVC[商品服务]
            SKU_SVC[SKU 服务]
            CATEGORY_SVC[分类服务]
            BRAND_SVC[品牌服务]
            REVIEW_SVC[评价服务]
        end
        subgraph 交易域
            ORDER_SVC[订单服务]
            CART_SVC[购物车服务]
            PAY_SVC[支付服务]
            REFUND_SVC[退款服务]
            COUPON_SVC[优惠券服务]
            PROMO_SVC[促销服务]
        end
        subgraph 物流域
            LOGISTICS_SVC[物流服务]
            WAREHOUSE_SVC[仓储服务]
            DELIVERY_SVC[配送服务]
        end
        subgraph 消息域
            NOTIFY_SVC[通知服务]
            SMS_SVC[短信服务]
            PUSH_SVC[推送服务]
            EMAIL_SVC[邮件服务]
        end
    end

    subgraph 中间件层
        REDIS[(Redis 集群)]
        MQ[RocketMQ]
        ES[(Elasticsearch)]
        NACOS[Nacos 注册中心]
        SENTINEL[Sentinel 控制台]
    end

    subgraph 数据层
        MYSQL_MASTER[(MySQL 主库)]
        MYSQL_SLAVE[(MySQL 从库)]
        MONGO[(MongoDB)]
        OSS[对象存储 OSS]
    end

    WEB & APP & H5 & MINI --> NGINX
    NGINX --> GW
    GW --> AUTH
    GW --> LIMIT
    AUTH --> USER_SVC
    LIMIT --> SENTINEL

    GW --> USER_SVC & PRODUCT_SVC & ORDER_SVC & CART_SVC & LOGISTICS_SVC
    USER_SVC --> MEMBER_SVC & ADDR_SVC
    PRODUCT_SVC --> SKU_SVC & CATEGORY_SVC & BRAND_SVC & REVIEW_SVC
    ORDER_SVC --> PAY_SVC & REFUND_SVC & COUPON_SVC & PROMO_SVC
    ORDER_SVC --> LOGISTICS_SVC
    LOGISTICS_SVC --> WAREHOUSE_SVC & DELIVERY_SVC
    NOTIFY_SVC --> SMS_SVC & PUSH_SVC & EMAIL_SVC

    ORDER_SVC --> MQ
    PAY_SVC --> MQ
    MQ --> NOTIFY_SVC
    MQ --> LOGISTICS_SVC

    USER_SVC & ORDER_SVC & PAY_SVC --> MYSQL_MASTER
    MYSQL_MASTER --> MYSQL_SLAVE
    PRODUCT_SVC & REVIEW_SVC --> MONGO
    PRODUCT_SVC --> ES
    USER_SVC & PRODUCT_SVC & ORDER_SVC --> REDIS
    REVIEW_SVC & PRODUCT_SVC --> OSS

    USER_SVC & PRODUCT_SVC & ORDER_SVC & LOGISTICS_SVC --> NACOS
```

## 2. 超长序列图 - 电商下单全链路

模拟从用户点击下单到收货完成的完整时序交互，涉及 12 个参与者。

```mermaid
sequenceDiagram
    actor 用户
    participant 前端
    participant 网关
    participant 购物车
    participant 订单服务
    participant 库存服务
    participant 优惠券
    participant 支付服务
    participant 第三方支付
    participant 消息队列
    participant 物流服务
    participant 通知服务

    用户->>前端: 点击结算
    前端->>网关: POST /api/order/confirm
    网关->>网关: JWT 鉴权校验
    网关->>购物车: 获取选中商品
    购物车-->>网关: 返回商品列表

    网关->>订单服务: 创建预订单
    activate 订单服务

    订单服务->>库存服务: 预扣库存
    activate 库存服务
    库存服务->>库存服务: 检查库存充足性
    alt 库存不足
        库存服务-->>订单服务: 库存不足异常
        订单服务-->>前端: 提示库存不足
        前端-->>用户: 显示库存不足弹窗
    else 库存充足
        库存服务-->>订单服务: 预扣成功，返回锁定ID
    end
    deactivate 库存服务

    订单服务->>优惠券: 核销优惠券
    activate 优惠券
    优惠券->>优惠券: 校验有效期和使用条件
    alt 优惠券无效
        优惠券-->>订单服务: 优惠券不可用
        订单服务->>库存服务: 回滚预扣库存
        订单服务-->>前端: 提示优惠券失效
    else 优惠券有效
        优惠券-->>订单服务: 核销成功，返回折扣金额
    end
    deactivate 优惠券

    订单服务->>订单服务: 计算最终金额（商品价+运费-优惠）
    订单服务-->>前端: 返回订单确认信息
    deactivate 订单服务

    前端-->>用户: 展示订单确认页
    用户->>前端: 确认支付
    前端->>网关: POST /api/pay/create

    网关->>支付服务: 创建支付单
    activate 支付服务
    支付服务->>第三方支付: 调用支付接口
    activate 第三方支付
    第三方支付-->>支付服务: 返回支付链接/二维码
    deactivate 第三方支付
    支付服务-->>前端: 返回支付参数
    deactivate 支付服务

    前端-->>用户: 唤起支付（微信/支付宝）
    用户->>第三方支付: 完成支付
    第三方支付->>支付服务: 异步回调通知
    activate 支付服务
    支付服务->>支付服务: 验签 + 幂等校验
    支付服务->>订单服务: 更新订单状态为已支付
    支付服务->>消息队列: 发送支付成功事件
    deactivate 支付服务

    消息队列->>库存服务: 确认扣减库存
    消息队列->>物流服务: 触发发货流程
    activate 物流服务
    物流服务->>物流服务: 分配仓库 + 生成运单
    物流服务->>通知服务: 发送发货通知
    deactivate 物流服务

    通知服务->>用户: 短信/推送：您的订单已发货

    Note over 用户,通知服务: === 等待物流配送中 ===

    物流服务->>通知服务: 签收回调
    通知服务->>用户: 推送：您的包裹已签收
    用户->>前端: 确认收货
    前端->>订单服务: 更新订单为已完成
    订单服务->>消息队列: 发送订单完成事件
    消息队列->>通知服务: 触发评价邀请
    通知服务->>用户: 推送：请对本次购物进行评价
```

## 3. 复杂状态机 - 订单生命周期

包含多层嵌套状态、并行状态和历史状态的完整订单状态机。

```mermaid
stateDiagram-v2
    [*] --> 待提交

    待提交 --> 待支付: 提交订单
    待提交 --> 已取消: 用户取消

    state 待支付 {
        [*] --> 等待用户操作
        等待用户操作 --> 支付处理中: 发起支付
        支付处理中 --> 支付验证: 第三方回调
        支付验证 --> 等待用户操作: 验证失败（可重试）
    }

    待支付 --> 已支付: 支付成功
    待支付 --> 已取消: 超时未支付（30分钟）
    待支付 --> 已取消: 用户主动取消

    state 已支付 {
        [*] --> 待审核
        待审核 --> 风控审核中: 触发风控规则
        待审核 --> 待发货: 审核通过
        风控审核中 --> 待发货: 风控通过
        风控审核中 --> 审核拒绝: 风控拦截
    }

    已支付 --> 待发货: 审核完成

    state 待发货 {
        [*] --> 仓库分配
        仓库分配 --> 拣货中: 分配完成
        拣货中 --> 打包中: 拣货完成
        打包中 --> 已出库: 打包完成
    }

    待发货 --> 配送中: 物流揽收

    state 配送中 {
        [*] --> 运输中
        运输中 --> 派送中: 到达目的城市
        派送中 --> 待签收: 快递员派送
    }

    配送中 --> 已签收: 用户签收
    配送中 --> 异常件: 物流异常

    异常件 --> 配送中: 重新派送
    异常件 --> 退回中: 无法送达

    已签收 --> 已完成: 确认收货（或7天自动确认）

    state 售后流程 {
        [*] --> 售后申请中
        售后申请中 --> 退款审核: 仅退款
        售后申请中 --> 退货审核: 退货退款
        退款审核 --> 退款中: 审核通过
        退货审核 --> 待退货: 审核通过
        待退货 --> 退货运输中: 用户寄回
        退货运输中 --> 退货验收: 商家收货
        退货验收 --> 退款中: 验收通过
        退货验收 --> 退货拒绝: 验收不通过
        退款中 --> 退款完成: 退款到账
    }

    已签收 --> 售后流程: 申请售后
    已完成 --> 售后流程: 申请售后（15天内）

    已完成 --> [*]
    已取消 --> [*]
```

## 4. 大规模类图 - 领域模型

模拟电商核心领域的完整类关系图，包含继承、组合、聚合、依赖等多种关系。

```mermaid
classDiagram
    class BaseEntity {
        <<abstract>>
        +Long id
        +Date createdAt
        +Date updatedAt
        +String createdBy
        +Boolean deleted
    }

    class User {
        +String username
        +String phone
        +String email
        +String avatar
        +UserStatus status
        +register()
        +login()
        +updateProfile()
    }

    class UserStatus {
        <<enumeration>>
        ACTIVE
        FROZEN
        CANCELLED
    }

    class MemberLevel {
        <<enumeration>>
        BRONZE
        SILVER
        GOLD
        PLATINUM
        DIAMOND
    }

    class Member {
        +MemberLevel level
        +Integer points
        +Date expireDate
        +upgrade()
        +deductPoints(amount)
        +addPoints(amount)
    }

    class Address {
        +String province
        +String city
        +String district
        +String detail
        +String zipCode
        +String contactName
        +String contactPhone
        +Boolean isDefault
    }

    class Product {
        +String name
        +String description
        +Category category
        +Brand brand
        +ProductStatus status
        +BigDecimal minPrice
        +BigDecimal maxPrice
        +onShelf()
        +offShelf()
    }

    class ProductStatus {
        <<enumeration>>
        DRAFT
        ON_SHELF
        OFF_SHELF
        DELETED
    }

    class SKU {
        +String skuCode
        +String specDesc
        +BigDecimal price
        +BigDecimal costPrice
        +Integer stock
        +String barcode
        +deductStock(qty)
        +addStock(qty)
    }

    class Category {
        +String name
        +Integer level
        +Category parent
        +List~Category~ children
        +Integer sortOrder
    }

    class Brand {
        +String name
        +String logo
        +String description
        +String country
    }

    class Order {
        +String orderNo
        +User buyer
        +OrderStatus status
        +BigDecimal totalAmount
        +BigDecimal discountAmount
        +BigDecimal payAmount
        +BigDecimal freightAmount
        +Address shippingAddress
        +String remark
        +submit()
        +pay()
        +cancel()
        +confirm()
    }

    class OrderStatus {
        <<enumeration>>
        PENDING_PAYMENT
        PAID
        SHIPPED
        DELIVERED
        COMPLETED
        CANCELLED
        REFUNDING
    }

    class OrderItem {
        +SKU sku
        +String productName
        +String skuSpec
        +Integer quantity
        +BigDecimal unitPrice
        +BigDecimal subtotal
    }

    class Payment {
        +String payNo
        +String tradeNo
        +PayChannel channel
        +BigDecimal amount
        +PayStatus status
        +Date paidAt
        +createPay()
        +callback()
        +refund()
    }

    class PayChannel {
        <<enumeration>>
        WECHAT
        ALIPAY
        UNION_PAY
        CREDIT_CARD
    }

    class PayStatus {
        <<enumeration>>
        PENDING
        SUCCESS
        FAILED
        REFUNDED
    }

    class Cart {
        +User user
        +List~CartItem~ items
        +addItem(sku, qty)
        +removeItem(skuId)
        +updateQty(skuId, qty)
        +clear()
    }

    class CartItem {
        +SKU sku
        +Integer quantity
        +Boolean checked
    }

    class Coupon {
        +String name
        +CouponType type
        +BigDecimal threshold
        +BigDecimal discount
        +Date startTime
        +Date endTime
        +Integer totalCount
        +Integer usedCount
        +claim()
        +use()
        +verify()
    }

    class CouponType {
        <<enumeration>>
        FULL_REDUCTION
        PERCENTAGE_OFF
        FREE_SHIPPING
        FIXED_AMOUNT
    }

    class Review {
        +User user
        +Product product
        +Order order
        +Integer rating
        +String content
        +List~String~ images
        +publish()
        +reply()
    }

    class Logistics {
        +String trackingNo
        +String carrier
        +LogisticsStatus status
        +List~LogisticsTrace~ traces
        +ship()
        +updateTrace()
        +sign()
    }

    class LogisticsStatus {
        <<enumeration>>
        PENDING
        PICKED_UP
        IN_TRANSIT
        DELIVERING
        SIGNED
        EXCEPTION
    }

    class LogisticsTrace {
        +Date time
        +String location
        +String description
    }

    BaseEntity <|-- User
    BaseEntity <|-- Product
    BaseEntity <|-- Order
    BaseEntity <|-- Payment
    BaseEntity <|-- Coupon
    BaseEntity <|-- Review
    BaseEntity <|-- Logistics

    User "1" --> "1" Member : 拥有
    User "1" --> "*" Address : 管理
    User "1" --> "1" Cart : 拥有
    User "1" --> "*" Order : 下单
    User "1" --> "*" Review : 发表
    User --> UserStatus

    Product "1" --> "*" SKU : 包含
    Product "*" --> "1" Category : 属于
    Product "*" --> "1" Brand : 归属
    Product --> ProductStatus

    Category "1" --> "*" Category : 子分类

    Order "1" --> "*" OrderItem : 包含
    Order "1" --> "1" Payment : 关联
    Order "1" --> "0..1" Coupon : 使用
    Order "1" --> "1" Logistics : 关联
    Order --> OrderStatus
    OrderItem "*" --> "1" SKU : 引用

    Cart "1" --> "*" CartItem : 包含
    CartItem "*" --> "1" SKU : 引用

    Payment --> PayChannel
    Payment --> PayStatus
    Member --> MemberLevel
    Coupon --> CouponType
    Logistics --> LogisticsStatus
    Logistics "1" --> "*" LogisticsTrace : 包含
```

## 5. 复杂甘特图 - 大型项目排期

模拟一个跨 6 个月、多团队并行的大型项目排期。

```mermaid
gantt
    title 电商平台 V2.0 重构项目排期
    dateFormat YYYY-MM-DD
    axisFormat %m/%d
    todayMarker stroke-width:3px,stroke:#f00

    section 项目管理
        需求评审与确认           :done, pm1, 2024-01-02, 10d
        技术方案设计             :done, pm2, after pm1, 14d
        里程碑一评审             :milestone, m1, after pm2, 0d
        中期检查                 :milestone, m2, 2024-04-01, 0d
        上线评审                 :milestone, m3, 2024-06-15, 0d

    section 基础架构组
        微服务框架搭建           :done, infra1, after pm2, 14d
        API Gateway 开发        :done, infra2, after infra1, 10d
        统一鉴权中心             :done, infra3, after infra1, 12d
        分布式配置中心           :done, infra4, after infra2, 7d
        链路追踪集成             :active, infra5, after infra4, 10d
        灰度发布系统             :infra6, after infra5, 14d
        性能压测与调优           :infra7, after infra6, 10d

    section 用户组
        用户中心重构             :done, user1, after infra1, 14d
        会员体系开发             :done, user2, after user1, 10d
        OAuth2 第三方登录        :active, user3, after user2, 10d
        用户画像系统             :user4, after user3, 14d
        积分商城                 :user5, after user4, 12d

    section 商品组
        商品中心重构             :done, prod1, after infra1, 21d
        SKU 管理系统             :done, prod2, after prod1, 14d
        搜索引擎集成(ES)         :active, prod3, after prod2, 14d
        智能推荐系统             :prod4, after prod3, 21d
        评价系统升级             :prod5, after prod2, 10d

    section 交易组
        订单中心重构             :done, trade1, after infra2, 21d
        支付系统升级             :active, trade2, after trade1, 14d
        优惠券引擎               :trade3, after trade2, 14d
        促销活动系统             :trade4, after trade3, 14d
        对账系统                 :trade5, after trade2, 10d
        发票系统                 :trade6, after trade5, 7d

    section 物流组
        物流中台开发             :logi1, after trade1, 14d
        仓储管理系统             :logi2, after logi1, 14d
        智能分仓算法             :logi3, after logi2, 10d
        配送调度系统             :logi4, after logi2, 12d

    section 前端组
        Design System 搭建      :done, fe1, after pm2, 14d
        PC 端重构               :active, fe2, after fe1, 42d
        H5 端重构               :fe3, after fe1, 35d
        小程序重构               :fe4, after fe3, 28d
        管理后台重构             :fe5, after fe2, 28d

    section 测试与上线
        集成测试                 :test1, 2024-05-15, 14d
        性能测试                 :test2, after test1, 7d
        安全审计                 :test3, after test1, 7d
        UAT 验收                :test4, after test2, 7d
        预发布环境部署           :deploy1, after test4, 3d
        正式上线                 :milestone, deploy2, after deploy1, 0d
```

## 6. 复杂 ER 图 - 数据库设计

模拟电商核心数据库的实体关系图。

```mermaid
erDiagram
    USERS {
        bigint id PK
        varchar username UK
        varchar phone UK
        varchar email
        varchar password_hash
        varchar avatar_url
        tinyint status
        timestamp created_at
        timestamp updated_at
    }

    MEMBERS {
        bigint id PK
        bigint user_id FK
        tinyint level
        int points
        date expire_date
    }

    ADDRESSES {
        bigint id PK
        bigint user_id FK
        varchar province
        varchar city
        varchar district
        varchar detail
        varchar contact_name
        varchar contact_phone
        boolean is_default
    }

    CATEGORIES {
        bigint id PK
        bigint parent_id FK
        varchar name
        tinyint level
        int sort_order
    }

    BRANDS {
        bigint id PK
        varchar name
        varchar logo_url
        varchar country
    }

    PRODUCTS {
        bigint id PK
        varchar name
        text description
        bigint category_id FK
        bigint brand_id FK
        tinyint status
        decimal min_price
        decimal max_price
        timestamp created_at
    }

    SKUS {
        bigint id PK
        bigint product_id FK
        varchar sku_code UK
        varchar spec_desc
        decimal price
        decimal cost_price
        int stock
        varchar barcode
    }

    ORDERS {
        bigint id PK
        varchar order_no UK
        bigint user_id FK
        bigint address_id FK
        bigint coupon_id FK
        tinyint status
        decimal total_amount
        decimal discount_amount
        decimal freight_amount
        decimal pay_amount
        varchar remark
        timestamp created_at
        timestamp paid_at
    }

    ORDER_ITEMS {
        bigint id PK
        bigint order_id FK
        bigint sku_id FK
        varchar product_name
        varchar sku_spec
        int quantity
        decimal unit_price
        decimal subtotal
    }

    PAYMENTS {
        bigint id PK
        varchar pay_no UK
        bigint order_id FK
        varchar trade_no
        tinyint channel
        decimal amount
        tinyint status
        timestamp paid_at
    }

    COUPONS {
        bigint id PK
        varchar name
        tinyint type
        decimal threshold
        decimal discount
        timestamp start_time
        timestamp end_time
        int total_count
        int used_count
    }

    REVIEWS {
        bigint id PK
        bigint user_id FK
        bigint product_id FK
        bigint order_id FK
        tinyint rating
        text content
        json images
        timestamp created_at
    }

    LOGISTICS {
        bigint id PK
        bigint order_id FK
        varchar tracking_no
        varchar carrier
        tinyint status
    }

    LOGISTICS_TRACES {
        bigint id PK
        bigint logistics_id FK
        timestamp trace_time
        varchar location
        varchar description
    }

    CART_ITEMS {
        bigint id PK
        bigint user_id FK
        bigint sku_id FK
        int quantity
        boolean checked
    }

    USERS ||--o| MEMBERS : "拥有"
    USERS ||--o{ ADDRESSES : "管理"
    USERS ||--o{ ORDERS : "下单"
    USERS ||--o{ REVIEWS : "发表"
    USERS ||--o{ CART_ITEMS : "购物车"
    CATEGORIES ||--o{ CATEGORIES : "子分类"
    CATEGORIES ||--o{ PRODUCTS : "包含"
    BRANDS ||--o{ PRODUCTS : "归属"
    PRODUCTS ||--o{ SKUS : "包含SKU"
    PRODUCTS ||--o{ REVIEWS : "被评价"
    ORDERS ||--o{ ORDER_ITEMS : "包含"
    ORDERS ||--|| PAYMENTS : "支付"
    ORDERS ||--o| COUPONS : "使用"
    ORDERS ||--o| LOGISTICS : "物流"
    ORDERS ||--o{ REVIEWS : "关联"
    ORDER_ITEMS }o--|| SKUS : "引用"
    CART_ITEMS }o--|| SKUS : "引用"
    LOGISTICS ||--o{ LOGISTICS_TRACES : "轨迹"
    ADDRESSES ||--o{ ORDERS : "收货地址"
```

## 7. 复杂流程图 - CI/CD 全流程

模拟一个包含多分支、条件判断、并行任务的 CI/CD 流水线。

```mermaid
graph LR
    subgraph 代码提交阶段
        A[开发者 Push] --> B{分支类型?}
        B -->|feature/*| C[触发 CI]
        B -->|develop| D[触发 CI + 部署 DEV]
        B -->|release/*| E[触发 CI + 部署 STG]
        B -->|main| F[触发 CI + 部署 PROD]
        B -->|hotfix/*| G[触发紧急 CI]
    end

    subgraph CI 流水线
        C & D & E & F & G --> H[拉取代码]
        H --> I[安装依赖]
        I --> J{并行检查}
        J --> K[ESLint 代码检查]
        J --> L[单元测试]
        J --> M[类型检查 TypeScript]
        J --> N[安全扫描 Snyk]
        K & L & M & N --> O{全部通过?}
        O -->|否| P[通知开发者修复]
        P --> Q[阻断流水线]
        O -->|是| R[构建 Docker 镜像]
        R --> S[推送镜像到 Harbor]
        S --> T[更新镜像 Tag]
    end

    subgraph DEV 环境部署
        D --> U[Helm 部署到 K8s DEV]
        U --> V[运行冒烟测试]
        V --> W{冒烟通过?}
        W -->|否| X[自动回滚]
        W -->|是| Y[通知测试团队]
    end

    subgraph STG 环境部署
        E --> Z[Helm 部署到 K8s STG]
        Z --> AA[运行集成测试]
        AA --> AB[运行 E2E 测试]
        AB --> AC[运行性能测试]
        AC --> AD{全部通过?}
        AD -->|否| AE[生成测试报告]
        AE --> AF[通知相关人员]
        AD -->|是| AG[标记为可发布]
    end

    subgraph PROD 环境部署
        F --> AH{需要审批?}
        AH -->|是| AI[等待 Tech Lead 审批]
        AI --> AJ{审批结果}
        AJ -->|拒绝| AK[终止部署]
        AJ -->|通过| AL[蓝绿部署到 PROD]
        AH -->|否| AL
        AL --> AM[切换 10% 流量]
        AM --> AN[监控 5 分钟]
        AN --> AO{指标正常?}
        AO -->|否| AP[自动回滚]
        AP --> AQ[发送告警]
        AO -->|是| AR[切换 50% 流量]
        AR --> AS[监控 10 分钟]
        AS --> AT{指标正常?}
        AT -->|否| AP
        AT -->|是| AU[切换 100% 流量]
        AU --> AV[部署完成通知]
    end

    T --> U & Z & AH
```

## 8. 用户旅程图 - 电商购物体验

```mermaid
journey
    title 用户网购完整旅程
    section 发现商品
        打开App首页: 5: 用户
        浏览推荐商品: 4: 用户
        使用搜索功能: 3: 用户
        筛选和排序结果: 3: 用户
        查看商品详情: 4: 用户
        阅读用户评价: 4: 用户
        对比多个商品: 2: 用户
    section 购买决策
        加入购物车: 5: 用户
        选择优惠券: 3: 用户
        凑单满减: 2: 用户
        确认收货地址: 4: 用户
        选择支付方式: 4: 用户
        完成支付: 5: 用户
    section 等待收货
        查看订单状态: 3: 用户
        查看物流信息: 3: 用户
        联系客服咨询: 2: 用户
        收到发货通知: 4: 用户
        等待快递配送: 2: 用户
    section 收货与售后
        签收包裹: 5: 用户
        检查商品质量: 4: 用户
        确认收货: 5: 用户
        撰写评价: 3: 用户
        申请售后退款: 1: 用户
        等待退款到账: 2: 用户
```

## 9. Git 分支管理图

```mermaid
gitGraph
    commit id: "init"
    commit id: "项目初始化"
    branch develop
    checkout develop
    commit id: "搭建基础框架"
    commit id: "配置 CI/CD"

    branch feature/user
    checkout feature/user
    commit id: "用户注册"
    commit id: "用户登录"
    commit id: "JWT 鉴权"
    checkout develop
    merge feature/user id: "合并用户模块" tag: "v0.1.0"

    branch feature/product
    checkout feature/product
    commit id: "商品 CRUD"
    commit id: "SKU 管理"
    commit id: "分类树"
    commit id: "搜索集成"
    checkout develop
    merge feature/product id: "合并商品模块" tag: "v0.2.0"

    branch feature/order
    checkout feature/order
    commit id: "购物车"
    commit id: "下单流程"
    commit id: "支付集成"
    commit id: "订单状态机"

    checkout develop
    branch feature/logistics
    checkout feature/logistics
    commit id: "物流对接"
    commit id: "轨迹查询"

    checkout develop
    merge feature/order id: "合并订单模块"
    merge feature/logistics id: "合并物流模块" tag: "v0.3.0"

    branch release/1.0
    checkout release/1.0
    commit id: "版本号更新"
    commit id: "修复集成 Bug"
    commit id: "性能优化"

    checkout main
    merge release/1.0 id: "v1.0.0 正式发布" tag: "v1.0.0"

    checkout develop
    merge release/1.0 id: "同步 release 修复"

    checkout main
    branch hotfix/pay-bug
    commit id: "修复支付回调 Bug"
    checkout main
    merge hotfix/pay-bug id: "紧急修复" tag: "v1.0.1"
    checkout develop
    merge hotfix/pay-bug id: "同步 hotfix"

    checkout develop
    commit id: "V2.0 新功能开发中..."
    commit id: "重构中间件层"
```

## 10. 复杂思维导图 - 技术选型

```mermaid
mindmap
  root((电商平台技术选型))
    前端技术栈
      框架
        Vue 3
        React 18
        Next.js
      状态管理
        Pinia
        Zustand
        Redux Toolkit
      UI 组件库
        Ant Design
        Element Plus
        Arco Design
      构建工具
        Vite
        Webpack 5
        Turbopack
      移动端
        React Native
        Flutter
        UniApp
        Taro
    后端技术栈
      语言与框架
        Java Spring Boot
        Go Gin
        Node.js Nest.js
        Python FastAPI
      微服务
        Spring Cloud
        Dubbo
        gRPC
        Service Mesh Istio
      API 设计
        RESTful
        GraphQL
        gRPC Proto
    数据存储
      关系型数据库
        MySQL 8.0
        PostgreSQL 16
        TiDB
      NoSQL
        Redis 7
        MongoDB 7
        Elasticsearch 8
      消息队列
        RocketMQ
        Kafka
        RabbitMQ
        Pulsar
      对象存储
        MinIO
        阿里云 OSS
        AWS S3
    DevOps
      容器化
        Docker
        Containerd
      编排
        Kubernetes
        Docker Compose
      CI/CD
        Jenkins
        GitLab CI
        GitHub Actions
        ArgoCD
      监控
        Prometheus
        Grafana
        SkyWalking
        ELK Stack
      日志
        Loki
        Fluentd
        Filebeat
    安全
      认证授权
        OAuth 2.0
        JWT
        RBAC
        ABAC
      网络安全
        WAF
        DDoS 防护
        SSL/TLS
      数据安全
        加密存储
        脱敏处理
        审计日志
```

## 11. 超复杂序列图 - 分布式事务 Saga 模式

模拟一个涉及 8 个服务的 Saga 分布式事务编排，包含正向操作和补偿回滚。

```mermaid
sequenceDiagram
    participant 编排器 as Saga 编排器
    participant 订单 as 订单服务
    participant 库存 as 库存服务
    participant 优惠 as 优惠券服务
    participant 积分 as 积分服务
    participant 账户 as 账户服务
    participant 支付 as 支付服务
    participant 物流 as 物流服务
    participant 通知 as 通知服务

    Note over 编排器,通知: ===== 正向流程：创建订单 =====

    编排器->>订单: 1. 创建订单(PENDING)
    activate 订单
    订单-->>编排器: 订单创建成功 orderId=10086
    deactivate 订单

    编排器->>库存: 2. 预扣库存
    activate 库存
    库存->>库存: 乐观锁扣减 stock - qty
    库存-->>编排器: 库存预扣成功 lockId=L001
    deactivate 库存

    编排器->>优惠: 3. 核销优惠券
    activate 优惠
    优惠->>优惠: 标记优惠券为 USED
    优惠-->>编排器: 核销成功 couponId=C001
    deactivate 优惠

    编排器->>积分: 4. 扣减积分
    activate 积分
    积分->>积分: 扣减 500 积分抵扣 5 元
    积分-->>编排器: 积分扣减成功
    deactivate 积分

    编排器->>账户: 5. 冻结余额
    activate 账户
    账户->>账户: 冻结 ￥195.00
    账户-->>编排器: 余额冻结成功 freezeId=F001
    deactivate 账户

    编排器->>支付: 6. 发起支付
    activate 支付
    支付->>支付: 创建支付单
    支付-->>编排器: 支付处理中 payId=P001
    deactivate 支付

    Note over 编排器,通知: ===== 异常场景：支付失败触发补偿 =====

    支付--x编排器: 支付失败（余额不足）

    rect rgb(255, 230, 230)
        Note over 编排器,通知: ===== 补偿流程：逆序回滚 =====

        编排器->>账户: 补偿5: 解冻余额 freezeId=F001
        activate 账户
        账户->>账户: 解冻 ￥195.00
        账户-->>编排器: 解冻成功
        deactivate 账户

        编排器->>积分: 补偿4: 返还积分
        activate 积分
        积分->>积分: 返还 500 积分
        积分-->>编排器: 积分返还成功
        deactivate 积分

        编排器->>优惠: 补偿3: 恢复优惠券
        activate 优惠
        优惠->>优惠: 标记优惠券为 AVAILABLE
        优惠-->>编排器: 优惠券恢复成功
        deactivate 优惠

        编排器->>库存: 补偿2: 释放库存
        activate 库存
        库存->>库存: 释放锁定 lockId=L001
        库存-->>编排器: 库存释放成功
        deactivate 库存

        编排器->>订单: 补偿1: 取消订单
        activate 订单
        订单->>订单: 更新状态为 CANCELLED
        订单-->>编排器: 订单已取消
        deactivate 订单
    end

    编排器->>通知: 发送订单取消通知
    通知->>通知: 推送 + 短信

    Note over 编排器,通知: ===== Saga 事务补偿完成 =====
```

## 12. 超大饼图与象限图

### 技术债务分布

```mermaid
pie showData
    title 技术债务分类占比（共 847 项）
    "代码重复" : 186
    "缺失单元测试" : 152
    "过时依赖" : 128
    "硬编码配置" : 97
    "未处理异常" : 83
    "SQL 注入风险" : 45
    "内存泄漏隐患" : 38
    "死代码" : 34
    "循环依赖" : 29
    "接口未鉴权" : 23
    "日志不规范" : 18
    "其他" : 14
```

### 技术评估象限图

```mermaid
quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Learning Cost --> High Learning Cost
    y-axis Low Ecosystem Maturity --> High Ecosystem Maturity
    quadrant-1 Cautious Adoption
    quadrant-2 Priority Adoption
    quadrant-3 Use As Needed
    quadrant-4 Not Recommended
    Vue.js: [0.35, 0.85]
    React: [0.45, 0.90]
    Svelte: [0.30, 0.45]
    Angular: [0.75, 0.80]
    Spring Boot: [0.60, 0.92]
    Go Gin: [0.40, 0.60]
    Rust Actix: [0.85, 0.35]
    Nest.js: [0.50, 0.55]
    FastAPI: [0.25, 0.50]
    Django: [0.45, 0.75]
    Kubernetes: [0.80, 0.88]
    Docker: [0.30, 0.95]
    Terraform: [0.65, 0.70]
    Pulumi: [0.70, 0.40]
```

## 13. 时间线图 - 项目里程碑

```mermaid
timeline
    title 电商平台发展历程
    section 2022 Q1-Q2 项目启动
        1月 : 团队组建 : 技术选型评审
        3月 : MVP 版本开发启动 : 用户中心上线
        5月 : 商品中心上线 : 首次内部测试
    section 2022 Q3-Q4 核心功能
        7月 : 订单系统上线 : 支付系统对接
        9月 : 物流系统集成 : 搜索引擎上线
        11月 : V1.0 正式发布 : 首批商家入驻
    section 2023 Q1-Q2 规模扩张
        1月 : 日活突破10万 : 引入推荐算法
        3月 : 营销系统上线 : 优惠券引擎
        5月 : 小程序上线 : H5端上线
    section 2023 Q3-Q4 技术升级
        7月 : 微服务架构重构 : 容器化部署
        9月 : 全链路压测 : 性能优化3倍
        11月 : V2.0发布 : 日活突破100万
    section 2024 Q1-Q2 智能化
        1月 : AI智能客服上线 : 个性化推荐V2
        3月 : 智能定价系统 : 供应链优化
        5月 : 国际化版本 : 多语言支持
```

## 14. 超复杂流程图 - 风控决策引擎

模拟一个多层嵌套、大量条件分支的实时风控决策流程。

```mermaid
graph TD
    START([交易请求进入]) --> PARSE[解析请求参数]
    PARSE --> BLACKLIST{命中黑名单?}

    BLACKLIST -->|设备指纹黑名单| REJECT_1[直接拒绝 R001]
    BLACKLIST -->|IP 黑名单| REJECT_2[直接拒绝 R002]
    BLACKLIST -->|手机号黑名单| REJECT_3[直接拒绝 R003]
    BLACKLIST -->|未命中| FREQ_CHECK{频率检查}

    FREQ_CHECK -->|同设备 1分钟>5次| CAPTCHA[弹出验证码]
    FREQ_CHECK -->|同IP 1小时>100次| IP_LIMIT[IP 限流]
    FREQ_CHECK -->|同账号 1天>50次| ACCOUNT_LIMIT[账号限流]
    FREQ_CHECK -->|正常| RULE_ENGINE[规则引擎]

    CAPTCHA --> CAPTCHA_RESULT{验证结果}
    CAPTCHA_RESULT -->|通过| RULE_ENGINE
    CAPTCHA_RESULT -->|失败3次| REJECT_4[拒绝 R004]

    subgraph 规则引擎评估
        RULE_ENGINE --> PARALLEL{并行评估}
        PARALLEL --> AMOUNT_RULE[金额规则]
        PARALLEL --> LOCATION_RULE[地理位置规则]
        PARALLEL --> BEHAVIOR_RULE[行为特征规则]
        PARALLEL --> DEVICE_RULE[设备环境规则]
        PARALLEL --> SOCIAL_RULE[社交关系规则]

        AMOUNT_RULE --> |单笔>5万| HIGH_RISK_1[高风险 +40分]
        AMOUNT_RULE --> |单笔>1万| MED_RISK_1[中风险 +20分]
        AMOUNT_RULE --> |正常| LOW_RISK_1[低风险 +0分]

        LOCATION_RULE --> |异地登录| HIGH_RISK_2[高风险 +35分]
        LOCATION_RULE --> |常用城市| LOW_RISK_2[低风险 +0分]

        BEHAVIOR_RULE --> |深夜交易| MED_RISK_2[中风险 +15分]
        BEHAVIOR_RULE --> |首次购买高价商品| MED_RISK_3[中风险 +20分]
        BEHAVIOR_RULE --> |正常模式| LOW_RISK_3[低风险 +0分]

        DEVICE_RULE --> |模拟器/Root| HIGH_RISK_3[高风险 +50分]
        DEVICE_RULE --> |新设备| MED_RISK_4[中风险 +10分]
        DEVICE_RULE --> |常用设备| LOW_RISK_4[低风险 +0分]

        SOCIAL_RULE --> |关联黑产账号| HIGH_RISK_4[高风险 +60分]
        SOCIAL_RULE --> |正常社交图谱| LOW_RISK_5[低风险 +0分]
    end

    HIGH_RISK_1 & MED_RISK_1 & LOW_RISK_1 --> SCORE[汇总风险分数]
    HIGH_RISK_2 & LOW_RISK_2 --> SCORE
    MED_RISK_2 & MED_RISK_3 & LOW_RISK_3 --> SCORE
    HIGH_RISK_3 & MED_RISK_4 & LOW_RISK_4 --> SCORE
    HIGH_RISK_4 & LOW_RISK_5 --> SCORE

    SCORE --> DECISION{风险等级判定}
    DECISION -->|分数>=80| BLOCK[拦截交易]
    DECISION -->|分数 50-79| REVIEW[人工审核队列]
    DECISION -->|分数 30-49| ENHANCED[增强验证]
    DECISION -->|分数<30| PASS[放行交易]

    BLOCK --> LOG_BLOCK[记录拦截日志]
    REVIEW --> MANUAL{人工审核结果}
    MANUAL -->|通过| PASS
    MANUAL -->|拒绝| LOG_BLOCK
    ENHANCED --> SMS_VERIFY[短信验证码]
    SMS_VERIFY --> SMS_RESULT{验证结果}
    SMS_RESULT -->|通过| PASS
    SMS_RESULT -->|失败| BLOCK

    PASS --> LOG_PASS[记录放行日志]
    LOG_PASS --> ML_FEEDBACK[反馈至 ML 模型]
    LOG_BLOCK --> ML_FEEDBACK
    ML_FEEDBACK --> END_NODE([流程结束])
```

## 15. 复杂饼图组合 - 系统监控仪表盘数据

### 服务器资源使用分布

```mermaid
pie showData
    title CPU 使用率分布（128核集群）
    "用户服务 (32核)" : 32
    "商品服务 (24核)" : 24
    "订单服务 (20核)" : 20
    "搜索服务 (16核)" : 16
    "支付服务 (12核)" : 12
    "物流服务 (8核)" : 8
    "消息服务 (6核)" : 6
    "监控服务 (4核)" : 4
    "空闲 (6核)" : 6
```

### 错误类型分布

```mermaid
pie showData
    title 近7天错误分类（共 12,847 次）
    "超时错误 TimeoutException" : 4523
    "空指针 NullPointerException" : 2187
    "数据库连接池耗尽" : 1856
    "Redis 连接超时" : 1342
    "MQ 消费失败" : 987
    "参数校验失败" : 756
    "权限不足 403" : 534
    "资源不存在 404" : 412
    "其他未分类" : 250
```

---

> 本文档包含 15 种不同类型的超复杂 Mermaid 图表，涵盖流程图、序列图、状态图、类图、ER 图、甘特图、饼图、思维导图、Git 图、用户旅程图、象限图、时间线图等，用于全面测试 Mermaid 渲染引擎在极端复杂场景下的表现。
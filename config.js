/**
 * 三国文字沙箱游戏 - 公开配置文件
 * 此文件包含不敏感的配置项，可提交到git仓库
 * 敏感配置（如API秘钥）应存储在环境变量或私有配置文件中
 */

const Config = {
    // API基础URL（服务端裁决端点）
    API_BASE_URL: process.env.API_BASE_URL || 'https://api.example.com',
    
    // 游戏版本
    GAME_VERSION: '0.1.0-alpha',
    
    // 游戏名称
    GAME_NAME: '三国文字沙箱',
    
    // 默认玩家属性
    DEFAULT_ATTRIBUTES: {
        strategy: 5,
        charisma: 5,
        martial: 5,
        intelligence: 5,
        luck: 5
    },
    
    // 默认开局年份
    DEFAULT_START_YEAR: 184, // 黄巾之乱起始年份
    
    // 叙事风格配置
    NARRATIVE_STYLE: {
        maxSceneLength: 150,     // 场景描述最大字数
        maxResultLength: 80,     // 结果反馈最大字数
        maxNarrativeLength: 120, // 叙事文本最大字数
        style: '古风旁白',       // 叙事风格
        forbiddenTerms: ['现代网络用语', '敏感政治词汇', '低俗内容']
    },
    
    // 事件系统配置
    EVENT_SYSTEM: {
        maxRetries: 2,           // LLM调用最大重试次数
        cooldownHours: 24,       // 事件去重冷却时间（小时）
        maxEventsPerSession: 100 // 单次会话最大事件数
    },
    
    // 微信小游戏特定配置
    WX_GAME: {
        maxPackageSize: 4,       // 首包最大大小（MB）
        resourceBaseUrl: '',     // 资源CDN地址
        enableSubpackages: true  // 是否启用分包加载
    },
    
    // 调试模式
    DEBUG_MODE: process.env.NODE_ENV !== 'production',
    
    // 日志级别
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}

// 全局可用（浏览器环境）
if (typeof window !== 'undefined') {
    window.GameConfig = Config;
}
// 客户端配置文件
// 管理服务端URL和其他客户端配置

const ClientConfig = {
    // 服务端裁决API地址
    // 开发环境：本地服务器
    // 生产环境：实际部署的服务端地址
    ADJUDICATION_API: process.env.ADJUDICATION_API || 'http://localhost:3000/intent/resolve',
    
    // 重试配置
    MAX_RETRIES: 2,
    RETRY_DELAY: 1000, // 毫秒
    
    // 超时配置
    REQUEST_TIMEOUT: 15000, // 15秒
    
    // 调试模式
    DEBUG: process.env.NODE_ENV !== 'production',
    
    // 默认游戏状态
    DEFAULT_PLAYER_STATE: {
        id: 'player_001',
        attrs: {
            strength: 75,
            intelligence: 82,
            charm: 68,
            luck: 55
        },
        legend: 30,
        tags: ['civilian'],
        reputation: 50,
        resources: {
            gold: 100,
            food: 200,
            soldiers: 0
        },
        location: {
            region: 'yingchuan',
            scene: 'village'
        }
    },
    
    // 默认世界状态
    DEFAULT_WORLD_STATE: {
        era: '184',
        flags: ['taipingdao_spread=high'],
        time: {
            year: 184,
            month: 2,
            day: 1
        },
        regionStatus: {
            jingzhou: 'stable',
            yuzhou: 'turmoil',
            jizhou: 'stable'
        }
    },
    
    // 默认NPC状态
    DEFAULT_NPC_STATE: [
        {
            id: 'caocao',
            name: '曹操',
            stance: 'neutral',
            trust: 30,
            location: 'luoyang'
        },
        {
            id: 'liubei',
            name: '刘备',
            stance: 'friendly',
            trust: 50,
            location: 'zhuoxian'
        }
    ]
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClientConfig;
}
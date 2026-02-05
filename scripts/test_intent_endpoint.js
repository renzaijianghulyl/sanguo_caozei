const axios = require('axios');

const API_URL = 'http://localhost:3000/intent/resolve';

async function testIntent() {
    console.log('测试意图端点...');
    
    const requestData = {
        player_state: {
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
        world_state: {
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
        npc_state: [
            {
                id: 'caocao',
                name: '曹操',
                stance: 'neutral',
                trust: 30,
                location: 'luoyang'
            }
        ],
        event_context: {
            recent_dialogue: [
                '建宁元年（公元168年），你醒来发现自己身处洛阳城外的小村庄。',
                '村中长者告诉你，黄巾之乱即将爆发，天下将乱。'
            ]
        },
        player_intent: '我想去洛阳结交豪杰'
    };
    
    try {
        const response = await axios.post(API_URL, requestData, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        console.log('响应状态:', response.status);
        console.log('响应数据:', JSON.stringify(response.data, null, 2));
        console.log('成功！');
        return response.data;
    } catch (error) {
        console.error('请求失败:', error.message);
        if (error.response) {
            console.error('响应状态:', error.response.status);
            console.error('响应数据:', error.response.data);
        }
        throw error;
    }
}

// 如果直接运行
if (require.main === module) {
    testIntent().then(() => {
        console.log('测试完成');
        process.exit(0);
    }).catch(err => {
        console.error('测试失败');
        process.exit(1);
    });
}

module.exports = testIntent;
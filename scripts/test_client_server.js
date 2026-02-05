// 客户端-服务端直接集成测试
// 不依赖微信模拟环境

const axios = require('axios');

// 测试配置
const API_URL = 'http://localhost:3000/intent/resolve';

// 测试数据
const testRequest = {
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

async function runTest() {
  console.log('=== 客户端-服务端集成测试 ===\n');
  
  try {
    // 1. 健康检查
    console.log('1. 检查服务端健康状态...');
    const healthResponse = await axios.get('http://localhost:3000/health');
    console.log(`✓ 服务端状态: ${JSON.stringify(healthResponse.data)}\n`);
    
    // 2. 发送裁决请求
    console.log('2. 发送裁决请求...');
    console.log(`玩家意图: "${testRequest.player_intent}"`);
    
    const startTime = Date.now();
    const response = await axios.post(API_URL, testRequest, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });
    const endTime = Date.now();
    
    console.log(`✓ 请求成功，响应时间: ${endTime - startTime}ms`);
    console.log(`状态码: ${response.status}`);
    console.log(`LLM模式: ${response.data._simulated ? '模拟' : '真实API'}`);
    
    // 3. 验证响应结构
    console.log('\n3. 验证响应结构...');
    
    const requiredFields = ['impact_level', 'intent_summary', 'success_prob', 'result'];
    const missingFields = requiredFields.filter(field => !response.data[field]);
    
    if (missingFields.length === 0) {
      console.log('✓ 响应包含所有必需字段');
    } else {
      console.log(`✗ 缺少字段: ${missingFields.join(', ')}`);
    }
    
    // 4. 显示叙事结果
    console.log('\n4. 叙事结果:');
    if (response.data.result?.narrative) {
      console.log(`"${response.data.result.narrative}"`);
    } else {
      console.log('✗ 叙事文本缺失');
    }
    
    // 5. 显示状态变化
    console.log('\n5. 状态变化:');
    if (response.data.state_changes) {
      console.log('玩家变化:', response.data.state_changes.player || []);
      console.log('声望变化:', response.data.state_changes.reputation || '无');
    } else {
      console.log('✗ 状态变化数据缺失');
    }
    
    // 6. 检查是否符合ADJUDICATION_SPEC规范
    console.log('\n6. 规范符合性检查:');
    
    const specChecks = [
      { field: 'impact_level', valid: ['minor', 'branch', 'global'] },
      { field: 'success_prob', valid: value => value >= 0 && value <= 1 }
    ];
    
    let allPassed = true;
    
    // 检查impact_level
    const impactLevel = response.data.impact_level;
    if (['minor', 'branch', 'global'].includes(impactLevel)) {
      console.log(`✓ impact_level有效: ${impactLevel}`);
    } else {
      console.log(`✗ impact_level无效: ${impactLevel}`);
      allPassed = false;
    }
    
    // 检查success_prob
    const successProb = response.data.success_prob;
    if (typeof successProb === 'number' && successProb >= 0 && successProb <= 1) {
      console.log(`✓ success_prob有效: ${successProb}`);
    } else {
      console.log(`✗ success_prob无效: ${successProb}`);
      allPassed = false;
    }
    
    // 检查narrative长度
    const narrative = response.data.result?.narrative || '';
    if (narrative.length > 0 && narrative.length <= 120) {
      console.log(`✓ narrative长度合适: ${narrative.length}字符`);
    } else if (narrative.length === 0) {
      console.log('✗ narrative为空');
      allPassed = false;
    } else {
      console.log(`⚠ narrative可能过长: ${narrative.length}字符`);
    }
    
    console.log('\n=== 测试完成 ===');
    console.log(`结果: ${allPassed ? '通过' : '部分失败'}`);
    
    // 返回结果用于后续处理
    return {
      success: allPassed,
      response: response.data,
      testRequest
    };
    
  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runTest().then(result => {
    console.log('\n测试数据已保存，可用于存档系统集成');
  });
}

module.exports = { runTest };
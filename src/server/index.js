const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const DeepSeekAdapter = require('./llm/deepseek');

const app = express();
const PORT = process.env.PORT || 3000;

// 获取DeepSeek API密钥
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_BASE = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';

// 初始化LLM适配器（如果API密钥存在）
let llmAdapter = null;
if (DEEPSEEK_API_KEY) {
    try {
        llmAdapter = new DeepSeekAdapter(DEEPSEEK_API_KEY, DEEPSEEK_API_BASE);
        console.log(`[Server] DeepSeek LLM适配器初始化成功，使用API端点: ${DEEPSEEK_API_BASE}`);
    } catch (error) {
        console.error('[Server] DeepSeek LLM适配器初始化失败:', error.message);
        console.warn('[Server] 将使用模拟裁决模式');
    }
} else {
    console.warn('[Server] DEEPSEEK_API_KEY环境变量未设置，将使用模拟裁决模式');
    console.warn('[Server] 请设置环境变量: export DEEPSEEK_API_KEY=your_api_key_here');
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        llm_enabled: !!llmAdapter,
        api_key_set: !!DEEPSEEK_API_KEY
    };
    res.json(status);
});

// Intent adjudication endpoint
app.post('/intent/resolve', async (req, res) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    try {
        // Validate request body
        const { player_state, world_state, npc_state, event_context, player_intent } = req.body;
        
        if (!player_intent) {
            console.warn(`[${requestId}] 验证失败: player_intent缺失`);
            return res.status(400).json({
                error: 'Validation failed',
                message: 'player_intent is required'
            });
        }

        // Log the request for debugging
        console.log(`[${requestId}] 意图裁决请求:`, {
            player_intent: player_intent.substring(0, 100),
            player_state_id: player_state?.id || 'unknown',
            world_state_era: world_state?.era || 'unknown',
            npc_count: npc_state?.length || 0
        });

        // 裁决上下文
        const adjudicationContext = {
            player_state,
            world_state,
            npc_state,
            event_context,
            player_intent
        };

        let adjudicationResult;
        
        // 如果LLM适配器可用，使用真实API
        if (llmAdapter) {
            try {
                console.log(`[${requestId}] 调用DeepSeek API进行裁决`);
                adjudicationResult = await llmAdapter.adjudicate(adjudicationContext);
                console.log(`[${requestId}] DeepSeek裁决成功，impact_level: ${adjudicationResult.impact_level}`);
                
            } catch (llmError) {
                console.error(`[${requestId}] DeepSeek裁决失败:`, llmError.message);
                
                // LLM失败时使用兜底裁决
                console.log(`[${requestId}] 使用兜底裁决逻辑`);
                adjudicationResult = llmAdapter.generateFallbackAdjudication(adjudicationContext);
                adjudicationResult._fallback = true;
                adjudicationResult._error = llmError.message;
            }
        } else {
            // 模拟裁决模式
            console.log(`[${requestId}] 使用模拟裁决模式`);
            adjudicationResult = simulateLLMAdjudication(adjudicationContext);
            adjudicationResult._simulated = true;
        }

        // 添加请求ID用于跟踪
        adjudicationResult.request_id = requestId;
        
        // 记录最终裁决结果摘要
        console.log(`[${requestId}] 裁决完成:`, {
            impact_level: adjudicationResult.impact_level,
            success_prob: adjudicationResult.success_prob,
            result_success: adjudicationResult.result.success,
            narrative_length: adjudicationResult.result.narrative?.length || 0
        });

        // Return structured response
        res.json(adjudicationResult);

    } catch (error) {
        console.error(`[${requestId}] 裁决处理异常:`, error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            request_id: requestId
        });
    }
});

// 模拟LLM裁决函数（当没有API密钥时使用）
function simulateLLMAdjudication(input) {
    const { player_intent, player_state, world_state } = input;
    
    // Determine impact level based on intent analysis
    let impact_level = 'minor';
    if (player_intent.includes('造反') || player_intent.includes('称帝') || player_intent.includes('联合')) {
        impact_level = 'global';
    } else if (player_intent.includes('结交') || player_intent.includes('招募') || player_intent.includes('结盟')) {
        impact_level = 'branch';
    }

    // Generate intent summary
    const intent_summary = `玩家意图：${player_intent.substring(0, 50)}${player_intent.length > 50 ? '...' : ''}`;

    // Determine success probability based on player attributes
    let success_prob = 0.7;
    if (player_state?.attrs?.cha && player_state.attrs.cha > 70) {
        success_prob = 0.85;
    } else if (player_state?.attrs?.cha && player_state.attrs.cha < 40) {
        success_prob = 0.4;
    }

    // Generate narrative feedback
    const narratives = [
        "你深吸一口气，将心中的盘算付诸行动。",
        "风云际会，你的决定或许将改变历史的走向。",
        "在这乱世之中，每一步都需谨慎权衡。",
        "你的意图如投石入湖，激起层层涟漪。"
    ];
    const narrative = narratives[Math.floor(Math.random() * narratives.length)];

    // Generate state changes based on impact level
    const state_changes = {
        player: [],
        npc: [],
        world: [],
        event: []
    };

    if (impact_level === 'global') {
        state_changes.player.push('reputation+10', 'legend+3');
        state_changes.world.push('historical_momentum=changed');
    } else if (impact_level === 'branch') {
        state_changes.player.push('reputation+5', 'legend+1');
        if (input.npc_state && input.npc_state.length > 0) {
            const npcId = input.npc_state[0].id;
            state_changes.npc.push(`${npcId}_trust+5`);
        }
    } else {
        state_changes.player.push('reputation+2');
    }

    // Construct the full response according to ADJUDICATION_SPEC.md
    return {
        impact_level,
        intent_summary,
        success_prob,
        result: {
            success: Math.random() > 0.3, // 70% success rate
            narrative,
            costs: ['energy-2'],
            effects: ['reputation+5'],
            world_flags: ['taipingdao_risk=monitoring'],
            followup_hooks: ['next_decision_point']
        },
        state_changes
    };
}

// Start server
console.log('[Server] 开始启动服务器...');
app.listen(PORT, () => {
    console.log(`[Server] 裁决服务器运行在端口 ${PORT}`);
    console.log(`[Server] 健康检查: http://localhost:${PORT}/health`);
    console.log(`[Server] 意图裁决: POST http://localhost:${PORT}/intent/resolve`);
    console.log(`[Server] LLM模式: ${llmAdapter ? '真实API' : '模拟'}`);
});

module.exports = app;
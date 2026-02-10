const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const DeepSeekAdapter = require('./llm/deepseek');
const EventManager = require('./events/EventManager');
const NPCRelationshipManager = require('./npc/NPCRelationshipManager');
const FactionManager = require('./factions/FactionManager');
const ComplianceFilter = require('./filters/ComplianceFilter');
const Monitor = require('./monitoring/Monitor');

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

// 初始化合规过滤器
let complianceFilter = null;
try {
    complianceFilter = new ComplianceFilter();
    console.log('[Server] 合规过滤器初始化成功');
} catch (error) {
    console.error('[Server] 合规过滤器初始化失败:', error.message);
    console.warn('[Server] 合规过滤功能将不可用');
}

// 初始化事件管理器
let eventManager = null;
try {
    eventManager = new EventManager();
    console.log('[Server] 事件管理器初始化成功');
} catch (error) {
    console.error('[Server] 事件管理器初始化失败:', error.message);
    console.warn('[Server] 事件功能将不可用');
}

// 初始化NPC关系管理器
let npcRelationshipManager = null;
try {
    npcRelationshipManager = new NPCRelationshipManager({
        npcsFile: 'data/npcs.json'
    });
    npcRelationshipManager.initialize();
    console.log('[Server] NPC关系管理器初始化成功');
} catch (error) {
    console.error('[Server] NPC关系管理器初始化失败:', error.message);
    console.warn('[Server] NPC关系功能将不可用');
}

// 初始化势力管理器
let factionManager = null;
try {
    factionManager = new FactionManager({
        dataDir: 'data/factions'
    });
    
    // 加载初始势力数据
    const initialFactionData = require('../../data/factions.json');
    factionManager.loadFromData(initialFactionData);
    factionManager.initialize();
    
    console.log('[Server] 势力管理器初始化成功');
} catch (error) {
    console.error('[Server] 势力管理器初始化失败:', error.message);
    console.warn('[Server] 势力系统功能将不可用');
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
        api_key_set: !!DEEPSEEK_API_KEY,
        event_manager_enabled: !!eventManager,
        npc_relationship_enabled: !!npcRelationshipManager,
        faction_manager_enabled: !!factionManager
    };
    res.json(status);
});

// 监控指标端点
app.get('/monitor/metrics', (req, res) => {
    try {
        const metrics = Monitor.getMetrics();
        res.json(metrics);
    } catch (error) {
        console.error('[Monitor] 获取指标失败:', error.message);
        res.status(500).json({
            error: 'monitor_error',
            message: '监控服务暂时不可用',
            technical_details: error.message
        });
    }
});

// 事件检查端点：客户端在场景变化时调用
app.post('/events/check', async (req, res) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    try {
        const { player_state, world_state } = req.body;
        
        if (!player_state || !world_state) {
            console.warn(`[${requestId}] 事件检查失败: 缺少玩家状态或世界状态`);
            return res.status(400).json({
                error: 'validation_failed',
                message: '游戏状态不完整，请刷新后重试',
                technical_details: 'player_state and world_state are required'
            });
        }
        
        console.log(`[${requestId}] 事件检查请求:`, {
            player_id: player_state.id || 'unknown',
            scene: player_state.scene || 'unknown',
            region: world_state.region || 'unknown'
        });
        
        let triggerableEvents = [];
        if (eventManager) {
            triggerableEvents = eventManager.checkTriggerableEvents(player_state, world_state);
        }
        
        const response = {
            request_id: requestId,
            triggerable_events: triggerableEvents.map(event => ({
                event_id: event.event_id,
                title: event.title,
                type: event.type,
                summary: event.summary,
                player_hint: event.player_hint,
                intent_prompt: event.player_intent_prompt,
                intent_tags: event.intent_tags
            })),
            count: triggerableEvents.length
        };
        
        console.log(`[${requestId}] 事件检查完成，找到 ${triggerableEvents.length} 个可触发事件`);
        res.json(response);
        
    } catch (error) {
        console.error(`[${requestId}] 事件检查异常:`, error);
        res.status(500).json({
            error: 'event_check_error',
            message: '网络波动，请稍后重试',
            request_id: requestId,
            technical_details: error.message
        });
    }
});

// 触发特定事件端点
app.post('/events/trigger', async (req, res) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    try {
        const { event_id, player_state, world_state, success } = req.body;
        
        if (!event_id || !player_state || !world_state) {
            console.warn(`[${requestId}] 事件触发失败: 缺少必要参数`);
            return res.status(400).json({
                error: 'validation_failed',
                message: '游戏状态不完整，请刷新后重试',
                technical_details: 'event_id, player_state and world_state are required'
            });
        }
        
        console.log(`[${requestId}] 事件触发请求:`, {
            event_id,
            player_id: player_state.id || 'unknown',
            success: success !== undefined ? success : 'auto'
        });
        
        if (!eventManager) {
            throw new Error('事件管理器未初始化');
        }
        
        // 触发事件（这里简化处理，实际应该根据success参数或自动判断）
        const eventResult = eventManager.triggerEvent(
            event_id,
            player_state,
            world_state,
            success !== undefined ? success : Math.random() > 0.3
        );
        
        const response = {
            request_id: requestId,
            ...eventResult
        };
        
        console.log(`[${requestId}] 事件触发完成: ${event_id}`);
        res.json(response);
        
    } catch (error) {
        console.error(`[${requestId}] 事件触发异常:`, error);
        res.status(500).json({
            error: 'event_trigger_error',
            message: '网络波动，请稍后重试',
            request_id: requestId,
            technical_details: error.message
        });
    }
});

// Intent adjudication endpoint
app.post('/intent/resolve', async (req, res) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    try {
        const startTime = Date.now();
        // Validate request body
        const { player_state, world_state, npc_state, event_context, player_intent } = req.body;
        
        if (!player_intent) {
            console.warn(`[${requestId}] 验证失败: player_intent缺失`);
            return res.status(400).json({
                error: 'validation_failed',
                message: '请输入您的意图',
                technical_details: 'player_intent is required'
            });
        }

        // === 玩家输入合规检查 ===
        if (complianceFilter) {
            const complianceCheck = complianceFilter.checkPlayerInput(player_intent);
            console.log(`[${requestId}] 玩家输入合规检查:`, {
                safe: complianceCheck.safe,
                riskLevel: complianceCheck.riskLevel,
                warningMessage: complianceCheck.warningMessage
            });
            
            if (!complianceCheck.safe) {
                // 高风险意图直接拦截，返回安全警告
                const safeNarrative = '此意图涉及敏感内容，请重新输入符合古风三国的意图。';
                console.warn(`[${requestId}] 拦截高风险玩家意图: ${player_intent.substring(0, 50)}...`);
                
                // 记录监控指标
                const durationMs = Date.now() - startTime;
                Monitor.recordAdjudication('blocked', false, durationMs, { requestId, player_intent: player_intent.substring(0, 100) });
                Monitor.recordComplianceCheck('blocked', { requestId, reason: complianceCheck.warningMessage });

                return res.json({
                    request_id: requestId,
                    impact_level: 'blocked',
                    intent_summary: `玩家意图因合规原因被拦截: ${complianceCheck.warningMessage}`,
                    success_prob: 0.0,
                    result: {
                        success: false,
                        narrative: safeNarrative,
                        costs: [],
                        effects: [],
                        world_flags: [],
                        followup_hooks: []
                    },
                    state_changes: {
                        player: [],
                        npc: [],
                        world: [],
                        event: []
                    },
                    _compliance_blocked: true,
                    _compliance_reason: complianceCheck.warningMessage
                });
            }
        } else {
            console.warn(`[${requestId}] 合规过滤器未初始化，跳过玩家输入检查`);
        }

        // 如果没有事件上下文，但事件管理器可用，检查是否有可触发事件
        let enhancedEventContext = event_context;
        if (!event_context && eventManager && player_state && world_state) {
            const triggerableEvents = eventManager.checkTriggerableEvents(player_state, world_state);
            if (triggerableEvents.length > 0) {
                enhancedEventContext = eventManager.prepareEventContext(triggerableEvents);
                console.log(`[${requestId}] 自动添加事件上下文: ${enhancedEventContext?.event_id}`);
            }
        }

        // 获取NPC关系上下文
        let npcRelationshipContext = [];
        if (npcRelationshipManager && player_state && player_state.id) {
            const relationships = npcRelationshipManager.getAllRelationships();
            npcRelationshipContext = relationships.map(rel => ({
                npcId: rel.npcId,
                closeness: rel.closeness,
                trust: rel.trust,
                stance: rel.stance,
                overall: rel.overall,
                level: rel.description
            }));
        }

        // 获取势力声望上下文
        let factionReputationContext = [];
        if (factionManager && player_state && player_state.id) {
            const factions = factionManager.getAllFactions();
            factionReputationContext = factions.map(faction => ({
                factionId: faction.id,
                name: faction.name,
                playerReputation: faction.playerReputation,
                reputationLevel: factionManager.getPlayerReputationLevel(faction.id)
            }));
        }

        // Log the request for debugging
        console.log(`[${requestId}] 意图裁决请求:`, {
            player_intent: player_intent.substring(0, 100),
            player_state_id: player_state?.id || 'unknown',
            world_state_era: world_state?.era || 'unknown',
            npc_count: npc_state?.length || 0,
            npc_relationships: npcRelationshipContext.length,
            faction_reputations: factionReputationContext.length,
            event_context_id: enhancedEventContext?.event_id || 'none'
        });

        // 裁决上下文
        const adjudicationContext = {
            player_state,
            world_state,
            npc_state,
            event_context: enhancedEventContext,
            player_intent,
            // 新增关系与势力上下文
            npc_relationships: npcRelationshipContext,
            faction_reputations: factionReputationContext
        };

        let adjudicationResult;
        
        // 如果LLM适配器可用，使用真实API
        if (llmAdapter) {
            try {
                console.log(`[${requestId}] 调用DeepSeek API进行裁决`);
                adjudicationResult = await llmAdapter.adjudicate(adjudicationContext);
                console.log(`[${requestId}] DeepSeek裁决成功，impact_level: ${adjudicationResult.impact_level}`);
                Monitor.recordLLMCall(true, false, false, { requestId });
                
            } catch (llmError) {
                console.error(`[${requestId}] DeepSeek裁决失败:`, llmError.message);
                
                // LLM失败时使用兜底裁决
                console.log(`[${requestId}] 使用兜底裁决逻辑`);
                adjudicationResult = llmAdapter.generateFallbackAdjudication(adjudicationContext);
                adjudicationResult._fallback = true;
                adjudicationResult._error = llmError.message;
                Monitor.recordLLMCall(false, true, false, { requestId, error: llmError.message });
                Monitor.recordError('api_failure', { requestId, error: llmError.message });
            }
        } else {
            // 模拟裁决模式
            console.log(`[${requestId}] 使用模拟裁决模式`);
            adjudicationResult = simulateLLMAdjudication(adjudicationContext);
            adjudicationResult._simulated = true;
            Monitor.recordLLMCall(true, false, true, { requestId });
        }

        // 添加请求ID用于跟踪
        adjudicationResult.request_id = requestId;
        
        // 如果事件被触发，添加事件信息到结果
        if (enhancedEventContext && enhancedEventContext.event_id) {
            adjudicationResult.event_info = {
                event_id: enhancedEventContext.event_id,
                event_title: enhancedEventContext.event_title,
                type: eventManager?.loader?.getEvent(enhancedEventContext.event_id)?.type || 'unknown'
            };
        }
        
        // 如果关系管理器可用，根据事件结果更新NPC关系
        if (npcRelationshipManager && adjudicationResult.state_changes) {
            const npcUpdates = npcRelationshipManager.updateRelationshipsByEvent(
                adjudicationResult,
                {
                    playerChoice: player_intent,
                    event_id: enhancedEventContext?.event_id
                }
            );
            
            adjudicationResult.npc_relationship_updates = npcUpdates;
        }
        
        // 如果势力管理器可用，根据事件结果更新势力状态
        if (factionManager && adjudicationResult.state_changes) {
            const factionUpdates = factionManager.updateByEvent(
                adjudicationResult,
                {
                    playerChoice: player_intent,
                    event_id: enhancedEventContext?.event_id
                }
            );
            
            adjudicationResult.faction_updates = factionUpdates;
        }
        
        // === LLM输出合规检查与叙事风格控制 ===
        if (complianceFilter && adjudicationResult.result && adjudicationResult.result.narrative) {
            const narrativeCheck = complianceFilter.checkLLMOutput(adjudicationResult.result.narrative);
            console.log(`[${requestId}] LLM叙事文本合规检查:`, {
                safe: narrativeCheck.safe,
                riskLevel: narrativeCheck.riskLevel,
                replacementsCount: narrativeCheck.narrativeStyleCheck.replacements.length,
                correctedLength: narrativeCheck.correctedNarrative.length
            });
            
            // 如果叙事文本不安全，使用安全回退
            if (!narrativeCheck.safe) {
                console.warn(`[${requestId}] LLM生成的叙事文本包含敏感内容，使用安全回退`);
                adjudicationResult.result.narrative = '故事的发展超出了预期的轨迹，请继续探索三国世界。';
                adjudicationResult._narrative_filtered = true;
                adjudicationResult._narrative_risk_level = narrativeCheck.riskLevel;
            } 
            // 如果安全但需要风格修正，使用修正后的文本
            else if (narrativeCheck.narrativeStyleCheck.replacements.length > 0) {
                console.log(`[${requestId}] 叙事风格修正: ${narrativeCheck.narrativeStyleCheck.replacements.length} 处替换`);
                adjudicationResult.result.narrative = narrativeCheck.correctedNarrative;
                adjudicationResult._narrative_style_corrected = true;
                adjudicationResult._narrative_replacements = narrativeCheck.narrativeStyleCheck.replacements;
            }
        } else if (complianceFilter) {
            console.warn(`[${requestId}] 合规过滤器可用，但裁决结果缺少叙事文本`);
        }
        
        // 记录最终裁决结果摘要
        const durationMs = Date.now() - startTime;
        Monitor.recordAdjudication(
            adjudicationResult.impact_level,
            adjudicationResult.result.success,
            durationMs,
            { requestId }
        );
        
        console.log(`[${requestId}] 裁决完成:`, {
            impact_level: adjudicationResult.impact_level,
            success_prob: adjudicationResult.success_prob,
            result_success: adjudicationResult.result.success,
            narrative_length: adjudicationResult.result.narrative?.length || 0,
            event_triggered: !!(enhancedEventContext && enhancedEventContext.event_id),
            npc_updated: adjudicationResult.npc_relationship_updates?.modified?.length || 0,
            factions_updated: adjudicationResult.faction_updates?.reputationChanges?.length || 0
        });

        // Return structured response
        res.json(adjudicationResult);

    } catch (error) {
        console.error(`[${requestId}] 裁决处理异常:`, error);
        res.status(500).json({
            error: 'network_fluctuation',
            message: '网络波动，请稍后重试',
            request_id: requestId,
            technical_details: error.message
        });
    }
});

// 模拟LLM裁决函数（当没有API密钥时使用）
function simulateLLMAdjudication(input) {
    const { player_intent, player_state, world_state, event_context, npc_relationships = [] } = input;
    
    // Determine impact level based on intent analysis
    let impact_level = 'minor';
    if (player_intent.includes('造反') || player_intent.includes('称帝') || player_intent.includes('联合')) {
        impact_level = 'global';
    } else if (player_intent.includes('结交') || player_intent.includes('招募') || player_intent.includes('结盟')) {
        impact_level = 'branch';
    }
    
    // 如果事件上下文存在，使用事件的影响提示
    if (event_context?.impact_hint) {
        impact_level = event_context.impact_hint;
    }

    // Generate intent summary
    const intent_summary = `玩家意图：${player_intent.substring(0, 50)}${player_intent.length > 50 ? '...' : ''}`;

    // Determine success probability based on player attributes and NPC关系
    let success_prob = 0.7;
    if (player_state?.attrs?.cha && player_state.attrs.cha > 70) {
        success_prob = 0.85;
    } else if (player_state?.attrs?.cha && player_state.attrs.cha < 40) {
        success_prob = 0.4;
    }
    
    // 如果有相关NPC关系，影响成功率
    const relevantNpcs = npc_relationships.filter(rel => 
        player_intent.includes(rel.npcId) || 
        (player_intent.includes(rel.name) && rel.name)
    );
    
    if (relevantNpcs.length > 0) {
        const avgTrust = relevantNpcs.reduce((sum, rel) => sum + (rel.trust || 50), 0) / relevantNpcs.length;
        const trustFactor = avgTrust / 100; // 0-1
        success_prob = success_prob * (0.7 + 0.3 * trustFactor); // 信任度影响30%
    }

    // Generate narrative feedback
    let narrative;
    if (event_context?.player_hint) {
        narrative = `${event_context.player_hint}\\n\\n${player_intent}，结果如何？`;
    } else {
        const narratives = [
            "你深吸一口气，将心中的盘算付诸行动。",
            "风云际会，你的决定或许将改变历史的走向。",
            "在这乱世之中，每一步都需谨慎权衡。",
            "你的意图如投石入湖，激起层层涟漪。"
        ];
        narrative = narratives[Math.floor(Math.random() * narratives.length)];
    }

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
        
        // 全局事件影响所有势力关系
        state_changes.world.push('diplomatic_han_court_huangjin-10');
        state_changes.world.push('diplomatic_warlord_dongzhuo_han_court-5');
    } else if (impact_level === 'branch') {
        state_changes.player.push('reputation+5', 'legend+1');
        if (input.npc_state && input.npc_state.length > 0) {
            const npcId = input.npc_state[0].id;
            state_changes.npc.push(`${npcId}_trust+5`);
        }
    } else {
        state_changes.player.push('reputation+2');
    }

    // 如果事件上下文存在，添加事件完成标记
    if (event_context?.event_id) {
        state_changes.event.push(`event_done:${event_context.event_id}`);
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
    console.log(`[Server] 事件检查: POST http://localhost:${PORT}/events/check`);
    console.log(`[Server] 事件触发: POST http://localhost:${PORT}/events/trigger`);
    console.log(`[Server] 意图裁决: POST http://localhost:${PORT}/intent/resolve`);
    console.log(`[Server] LLM模式: ${llmAdapter ? '真实API' : '模拟'}`);
    console.log(`[Server] 事件模式: ${eventManager ? '启用' : '禁用'}`);
    console.log(`[Server] NPC关系模式: ${npcRelationshipManager ? '启用' : '禁用'}`);
    console.log(`[Server] 势力系统模式: ${factionManager ? '启用' : '禁用'}`);
});

module.exports = app;
const axios = require('axios');

/**
 * DeepSeek LLM集成模块
 * 严格遵循ADJUDICATION_SPEC.md规范
 */
class DeepSeekAdapter {
    constructor(apiKey, baseURL = 'https://api.deepseek.com') {
        if (!apiKey) {
            throw new Error('DeepSeek API key is required');
        }
        this.apiKey = apiKey;
        this.baseURL = baseURL;
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        // 重试配置
        this.maxRetries = 2;
        this.retryDelay = 1000; // 1秒
    }

    /**
     * 构建裁决Prompt
     * @param {Object} context - 裁决上下文
     * @returns {string} 格式化后的Prompt
     */
    buildAdjudicationPrompt(context) {
        const { player_state, world_state, npc_state, event_context, player_intent } = context;
        
        return `你是一个三国时期的历史裁决者，负责根据玩家的意图和当前世界状态，给出合理、符合历史逻辑的裁决结果。

## 游戏背景
当前是公元${world_state?.era || 184}年，${world_state?.region ? `位于${world_state.region}地区` : '天下大乱，黄巾起义席卷中原'}。

## 玩家状态
- 身份：${player_state?.id || '平民'}
- 属性：${player_state?.attrs ? JSON.stringify(player_state.attrs, null, 2) : '未知'}
- 传奇度：${player_state?.legend || 0}
- 标签：${player_state?.tags ? player_state.tags.join(', ') : '无'}

## NPC状态
${npc_state && npc_state.length > 0 ? 
    npc_state.map(npc => `- ${npc.id}: 立场${npc.stance}, 信任度${npc.trust}`).join('\n') : 
    '暂无相关NPC'}

## 事件上下文
${event_context ? 
    `事件ID: ${event_context.event_id}
场景: ${event_context.scene}
传闻: ${event_context.rumors || '无'}` : 
    '暂无特殊事件'}

## 玩家意图
"${player_intent}"

## 裁决要求
你必须严格按照以下JSON格式输出裁决结果，不要包含任何额外的解释、Markdown格式或代码块：

{
  "impact_level": "global | branch | minor",
  "intent_summary": "一句话概述",
  "success_prob": 0.0,
  "result": {
    "success": true,
    "narrative": "短叙事反馈（古风旁白风格，不超过120字）",
    "costs": ["资源类型-数值"],
    "effects": ["效果标识"],
    "world_flags": ["世界标记"],
    "followup_hooks": ["后续钩子"]
  },
  "state_changes": {
    "player": ["玩家状态变更"],
    "npc": ["NPC关系变更"],
    "world": ["世界状态变更"],
    "event": ["事件状态变更"]
  }
}

## 重要规则
1. impact_level分级：
   - global: 影响势力格局、关键历史节点（如称帝、造反、联合诸侯）
   - branch: 影响局部剧情、NPC关系（如结交、招募、结盟）
   - minor: 影响资源或短期情绪（如购买物品、打听消息）

2. 状态变更规则：
   - 变更必须在允许字段内（player: 声望、传奇、资源；npc: 信任、立场；world: 时代标记、地区状态）
   - impact_level决定可改动范围
   - 每次裁决最多影响3个主字段
   - 不允许直接抹除核心世界标记（除非global级别）

3. 叙事风格：
   - 古风旁白 + 少量对话
   - 禁止现代网络用语
   - 文本长度：叙事≤120字

4. 成功概率：
   - 根据玩家属性、当前状态、意图难度综合评估（0.0-1.0）

现在请基于以上信息，给出你的裁决结果：`;
    }

    /**
     * 调用DeepSeek API进行裁决
     * @param {Object} context - 裁决上下文
     * @param {number} retryCount - 当前重试次数
     * @returns {Promise<Object>} 裁决结果
     */
    async adjudicate(context, retryCount = 0) {
        try {
            const prompt = this.buildAdjudicationPrompt(context);
            
            console.log(`[DeepSeek] 调用LLM裁决，重试次数: ${retryCount}`);
            
            const response = await this.client.post('/chat/completions', {
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个严谨的历史裁决者，必须严格输出指定的JSON格式，不包含任何额外文本。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000,
                response_format: { type: 'json_object' }
            });

            const content = response.data.choices[0].message.content;
            console.log('[DeepSeek] 原始响应:', content.substring(0, 200) + '...');

            // 尝试解析JSON
            let result;
            try {
                result = JSON.parse(content);
            } catch (parseError) {
                console.error('[DeepSeek] JSON解析失败:', parseError.message);
                
                // 尝试修复JSON（移除可能的代码块标记）
                const cleaned = content.replace(/```json\s*|\s*```/g, '').trim();
                try {
                    result = JSON.parse(cleaned);
                    console.log('[DeepSeek] 修复JSON成功');
                } catch (secondError) {
                    // 如果仍然失败，根据重试策略处理
                    if (retryCount < this.maxRetries) {
                        console.log(`[DeepSeek] 重试裁决 (${retryCount + 1}/${this.maxRetries})`);
                        await this.delay(this.retryDelay * (retryCount + 1));
                        return this.adjudicate(context, retryCount + 1);
                    } else {
                        throw new Error(`JSON解析失败，已重试${this.maxRetries}次: ${secondError.message}`);
                    }
                }
            }

            // 验证结果结构
            this.validateResult(result);
            
            console.log(`[DeepSeek] 裁决成功，impact_level: ${result.impact_level}`);
            return result;

        } catch (error) {
            console.error('[DeepSeek] 裁决失败:', error.message);
            
            // 网络错误或API错误，尝试重试
            if (retryCount < this.maxRetries && 
                (error.response?.status >= 500 || error.code === 'ECONNABORTED')) {
                console.log(`[DeepSeek] 重试裁决 (${retryCount + 1}/${this.maxRetries})`);
                await this.delay(this.retryDelay * (retryCount + 1));
                return this.adjudicate(context, retryCount + 1);
            }
            
            // 最终失败，抛出错误
            throw error;
        }
    }

    /**
     * 验证裁决结果结构
     * @param {Object} result - 裁决结果
     */
    validateResult(result) {
        const requiredFields = ['impact_level', 'intent_summary', 'success_prob', 'result', 'state_changes'];
        for (const field of requiredFields) {
            if (!(field in result)) {
                throw new Error(`缺少必需字段: ${field}`);
            }
        }

        // 验证impact_level取值范围
        const validLevels = ['global', 'branch', 'minor'];
        if (!validLevels.includes(result.impact_level)) {
            throw new Error(`无效的impact_level: ${result.impact_level}，必须是 ${validLevels.join(', ')}`);
        }

        // 验证success_prob范围
        if (typeof result.success_prob !== 'number' || result.success_prob < 0 || result.success_prob > 1) {
            throw new Error(`success_prob必须是0-1之间的数字，当前值: ${result.success_prob}`);
        }

        // 验证result结构
        const resultFields = ['success', 'narrative', 'costs', 'effects', 'world_flags', 'followup_hooks'];
        for (const field of resultFields) {
            if (!(field in result.result)) {
                throw new Error(`result缺少字段: ${field}`);
            }
        }

        // 验证state_changes结构
        const stateFields = ['player', 'npc', 'world', 'event'];
        for (const field of stateFields) {
            if (!(field in result.state_changes)) {
                throw new Error(`state_changes缺少字段: ${field}`);
            }
        }

        // 验证叙事长度
        if (result.result.narrative.length > 120) {
            console.warn(`[DeepSeek] 叙事长度超过120字: ${result.result.narrative.length}`);
        }
    }

    /**
     * 延迟函数
     * @param {number} ms - 毫秒数
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 生成兜底裁决（当LLM完全失败时使用）
     * @param {Object} context - 裁决上下文
     * @returns {Object} 兜底裁决结果
     */
    generateFallbackAdjudication(context) {
        console.log('[DeepSeek] 生成兜底裁决');
        
        const { player_intent, event_context } = context;
        
        // 简单的兜底逻辑
        return {
            impact_level: 'minor',
            intent_summary: `玩家意图：${player_intent.substring(0, 30)}...`,
            success_prob: 0.5,
            result: {
                success: true,
                narrative: '世事难料，你的行动引起了些许波澜，但并未改变大势。在这乱世之中，每一步都需谨慎。',
                costs: ['energy-1'],
                effects: ['reputation+1'],
                world_flags: [],
                followup_hooks: ['continue']
            },
            state_changes: {
                player: ['reputation+1'],
                npc: [],
                world: [],
                event: event_context ? [`event_progress:${event_context.event_id}`] : []
            }
        };
    }
}

module.exports = DeepSeekAdapter;
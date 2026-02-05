const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

const SERVER_PORT = 3000;
const SERVER_PATH = path.join(__dirname, '../src/server/index.js');

let serverProcess = null;

async function startServer() {
    return new Promise((resolve, reject) => {
        console.log('启动服务器...');
        serverProcess = spawn('node', [SERVER_PATH], {
            env: { ...process.env, PORT: SERVER_PORT },
            stdio: 'pipe',
            cwd: path.join(__dirname, '..')
        });

        let serverReady = false;
        let stdoutData = '';
        let stderrData = '';

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdoutData += output;
            console.log(`[Server] ${output.trim()}`);
            if (output.includes('裁决服务器运行在端口')) {
                serverReady = true;
            }
        });

        serverProcess.stderr.on('data', (data) => {
            const error = data.toString();
            stderrData += error;
            console.error(`[Server Error] ${error.trim()}`);
        });

        serverProcess.on('exit', (code, signal) => {
            reject(new Error(`服务器进程退出，code=${code}, signal=${signal}`));
        });

        // 健康检查轮询
        const startTime = Date.now();
        const timeout = 15000;
        const checkHealth = async () => {
            try {
                const response = await axios.get(`http://localhost:${SERVER_PORT}/health`);
                if (response.status === 200) {
                    console.log('健康检查通过:', response.data);
                    resolve();
                    return;
                }
            } catch (err) {}
            
            if (Date.now() - startTime > timeout) {
                reject(new Error('服务器启动超时'));
                return;
            }
            setTimeout(checkHealth, 500);
        };
        setTimeout(checkHealth, 1000);
    });
}

function stopServer() {
    if (serverProcess) {
        console.log('停止服务器...');
        serverProcess.kill();
        serverProcess = null;
    }
}

async function testIntentEndpoint() {
    try {
        await startServer();
        
        // 等待确保服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('\n发送测试意图请求...');
        const testData = {
            player_state: {
                id: 'test_player',
                attrs: { strength: 75, intelligence: 82, charm: 68, luck: 55 },
                legend: 30,
                reputation: 50
            },
            world_state: {
                era: '184',
                flags: ['taipingdao_spread=high']
            },
            npc_state: [],
            event_context: null,
            player_intent: '我想去洛阳结交豪杰'
        };
        
        const response = await axios.post(`http://localhost:${SERVER_PORT}/intent/resolve`, testData, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        
        console.log('响应状态:', response.status);
        console.log('响应数据:', JSON.stringify(response.data, null, 2));
        
        // 检查响应结构
        if (response.data && response.data.impact_level && response.data.result && response.data.result.narrative) {
            console.log('\n✓ 意图端点返回有效裁决结果');
            console.log('叙事:', response.data.result.narrative);
        } else {
            console.log('\n✗ 响应结构不完整');
        }
        
        stopServer();
        return true;
        
    } catch (error) {
        console.error('测试失败:', error.message);
        stopServer();
        return false;
    }
}

// 运行测试
if (require.main === module) {
    testIntentEndpoint()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(err => {
            console.error('未预期的错误:', err);
            process.exit(1);
        });
}

module.exports = { testIntentEndpoint };
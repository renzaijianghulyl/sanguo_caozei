const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');

const SERVER_PORT = 3000;
const SERVER_PATH = path.join(__dirname, '../src/server/index.js');

console.log('SERVER_PATH:', SERVER_PATH);

// 检查文件是否存在
const fs = require('fs');
if (!fs.existsSync(SERVER_PATH)) {
    console.error('文件不存在:', SERVER_PATH);
    process.exit(1);
}

console.log('启动服务器进程...');
const serverProcess = spawn('node', [SERVER_PATH], {
    env: { ...process.env, PORT: SERVER_PORT },
    stdio: 'pipe',
    cwd: path.join(__dirname, '..')  // 项目根目录
});

let stdoutData = '';
let stderrData = '';

serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    stdoutData += output;
    console.log(`[Server stdout] ${output.trim()}`);
});

serverProcess.stderr.on('data', (data) => {
    const error = data.toString();
    stderrData += error;
    console.error(`[Server stderr] ${error.trim()}`);
});

serverProcess.on('exit', (code, signal) => {
    console.error(`进程退出，code=${code}, signal=${signal}`);
    console.error('stderr:', stderrData);
    process.exit(1);
});

serverProcess.on('error', (err) => {
    console.error('进程错误:', err);
    process.exit(1);
});

// 等待一段时间后检查健康
setTimeout(async () => {
    try {
        const response = await axios.get(`http://localhost:${SERVER_PORT}/health`);
        console.log('健康检查成功:', response.data);
        console.log('服务器启动成功');
        serverProcess.kill();
        process.exit(0);
    } catch (err) {
        console.error('健康检查失败:', err.message);
        console.log('stdout:', stdoutData);
        console.log('stderr:', stderrData);
        serverProcess.kill();
        process.exit(1);
    }
}, 5000);
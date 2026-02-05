#!/bin/bash

# 三国文字沙箱游戏 - 自动同步脚本
# 将代码提交到远程git仓库并同步到本地目录

# 配置变量（请根据实际情况修改）
REMOTE_REPO="https://github.com/renzaijianghulyl/demo.git"
LOCAL_SYNC_DIR="/Users/liyulong/Desktop/caozei"
BRANCH="main"
COMMIT_MESSAGE="Auto-sync: $(date '+%Y-%m-%d %H:%M:%S')"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查当前目录是否为git仓库
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "当前目录不是git仓库"
        exit 1
    fi
}

# 设置git远程仓库
setup_remote() {
    # 检查是否已配置远程仓库
    if ! git remote | grep -q origin; then
        log_info "添加远程仓库 origin: $REMOTE_REPO"
        git remote add origin "$REMOTE_REPO"
    else
        # 更新远程仓库URL
        log_info "更新远程仓库 origin URL"
        git remote set-url origin "$REMOTE_REPO"
    fi
}

# git凭据配置（避免硬编码）
# 建议使用以下方式之一：
# 1. 环境变量: GIT_USERNAME, GIT_PASSWORD 或 GIT_TOKEN
# 2. SSH密钥
# 3. git凭据存储
setup_git_credentials() {
    # 如果使用HTTP(S)远程仓库且需要认证，可以在这里配置
    # 注意：不建议在脚本中硬编码凭据
    if [[ "$REMOTE_REPO" == https://* ]]; then
        log_warn "使用HTTPS远程仓库，请确保已配置git凭据"
        log_warn "建议使用：git config --global credential.helper store"
        log_warn "或设置环境变量：GIT_USERNAME, GIT_PASSWORD"
    fi
}

# 提交更改到git
commit_changes() {
    log_info "添加文件到暂存区..."
    git add .
    
    # 检查是否有更改
    if git diff --cached --quiet; then
        log_info "没有更改需要提交"
        return 1
    fi
    
    log_info "提交更改: $COMMIT_MESSAGE"
    git commit -m "$COMMIT_MESSAGE"
    return 0
}

# 推送到远程仓库
push_to_remote() {
    log_info "推送到远程仓库 ($BRANCH 分支)..."
    
    # 设置上游分支（如果尚未设置）
    if ! git branch --list "$BRANCH"; then
        git checkout -b "$BRANCH"
    fi
    
    # 推送（强制推送仅用于初始设置，正常情况使用正常推送）
    if git push -u origin "$BRANCH" 2>/dev/null; then
        log_info "推送成功"
    else
        log_warn "首次推送失败，尝试强制推送（仅适用于初始设置）"
        git push -u origin "$BRANCH" --force
    fi
}

# 同步到本地目录
sync_to_local() {
    if [ ! -d "$LOCAL_SYNC_DIR" ]; then
        log_warn "本地同步目录不存在: $LOCAL_SYNC_DIR"
        log_info "尝试创建目录..."
        mkdir -p "$LOCAL_SYNC_DIR"
    fi
    
    log_info "同步到本地目录: $LOCAL_SYNC_DIR"
    
    # 使用rsync（如果可用）或cp
    if command -v rsync >/dev/null 2>&1; then
        rsync -av --delete \
            --exclude='.git/' \
            --exclude='node_modules/' \
            --exclude='.env' \
            --exclude='*.tmp' \
            --exclude='temp/' \
            ./ "$LOCAL_SYNC_DIR"/
        log_info "rsync同步完成"
    else
        # 回退到cp
        cp -r ./* "$LOCAL_SYNC_DIR"/ 2>/dev/null
        cp -r ./.[^.]* "$LOCAL_SYNC_DIR"/ 2>/dev/null
        log_info "cp同步完成"
    fi
}

# 主函数
main() {
    log_info "开始自动同步流程..."
    log_info "远程仓库: $REMOTE_REPO"
    log_info "本地同步目录: $LOCAL_SYNC_DIR"
    
    # 检查git仓库
    check_git_repo
    
    # 设置远程仓库
    setup_remote
    
    # 配置git凭据（提示）
    setup_git_credentials
    
    # 提交更改
    if commit_changes; then
        # 推送到远程
        push_to_remote
    else
        log_info "没有新更改，跳过推送"
    fi
    
    # 同步到本地目录
    sync_to_local
    
    log_info "自动同步完成"
}

# 执行主函数
main "$@"
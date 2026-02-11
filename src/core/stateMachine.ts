export interface WorldSnapshot {
  summary: string;
  flags: string[];
}

export function buildWorldSnapshot(): WorldSnapshot {
  // TODO: 结合事件引擎生成真实快照。当前返回占位数据，避免阻塞客户端开发。
  return {
    summary: "世界状态快照占位",
    flags: []
  };
}

# Tool Attempt 使用 at-least-once 调度

我们决定不宣称外部副作用具有 exactly-once 保证，而让 Tool Attempt 使用 at-least-once 调度，并通过稳定幂等键、执行前持久化、执行后读回和未知结果对账避免重复副作用。Worker 中断后必须先确认动作是否已经生效，只有能够证明尚未执行时才自动重试；无法确认的高风险动作进入安全等待，而不是盲目重复或错误宣称失败。

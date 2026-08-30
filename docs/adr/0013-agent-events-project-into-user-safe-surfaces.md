# Agent 事件必须投影为用户安全界面

我们决定把 Durable Run Event、模型 Context、Run Evidence 与普通用户界面分开：运行事件先按稳定 Item 生命周期组装，再投影为过程状态、Assistant 正文、安全工具视图、审批节点或隐藏节点；没有安全投影的 Skill/Tool 结果禁止回退展示原始文本。普通用户可以看到 Orb、受控状态、经过过滤的推理摘要和可展开证据轨迹，原始推理、系统提示词、Skill 正文、工具参数和 rawData 只进入受权限保护的 Evidence/Admin 视图。这个边界借鉴 Codex 的 Thread Item 与 delta/final 分离、DeepSeek Harness 的 event→node→UI slot 投影，并收紧其 raw-result fallback，以根治空消息、协议泄漏和用户界面依赖调试载荷的问题。

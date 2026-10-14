import { deriveIntentConstraints } from "@/lib/agent/intent-constraints";

export function permitsProfileSignalCapture(content: string, priorUserContent: readonly string[] = []): boolean {
  return [...priorUserContent, content].every((text) => {
    const constraints = deriveIntentConstraints(text);
    if (constraints.noProfileWrite || constraints.writePolicy === "forbidden") return false;
    if (/(?:只|仅).{0,12}(?:当前|本次|这次|这个).{0,6}(?:会话|对话).{0,8}(?:使用|保留|有效)/.test(text)) return false;
    if (/(?:只|仅).{0,8}(?:用于|用在|限于|作为).{0,10}(?:当前|本次|这次|这个).{0,6}(?:会话|对话|聊天)/.test(text)) return false;
    if (/(?:虚构|假设|示例|演示|测试).{0,12}(?:资料|经历|数据|人物|对话|场景)|(?:不是|不属于).{0,8}(?:我|本人).{0,8}(?:资料|经历|职业事实|偏好|事实)/.test(text)) return false;
    if (/(?:不要|请勿|禁止|不允许|不用|无需|别).{0,12}(?:保存|记录|写入|更新|提取|沉淀).{0,24}(?:画像|个人资料|职业事实|记忆|任何(?:数据|内容))/.test(text)) return false;
    if (/\b(?:fictional|synthetic|hypothetical|example)\b.{0,24}\b(?:profile|resume|data|scenario|conversation)\b|\b(?:do not|don't|never)\b.{0,12}\b(?:save|store|record|remember|update|write)\b|\b(?:only|solely)\b.{0,20}\b(?:this|current)\b.{0,12}\b(?:chat|conversation|session)\b/i.test(text)) return false;
    return true;
  });
}

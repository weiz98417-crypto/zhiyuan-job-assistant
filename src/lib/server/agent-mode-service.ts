import { loadModeDocument, loadRegistryText } from "@/lib/agent/knowledge/registry/loader";

const MODE_FILES = ["dingwei", "interview-prep"] as const;

export type AgentModeName = (typeof MODE_FILES)[number];

export function loadAgentMode(name: AgentModeName): string {
  const content = loadModeDocument("zh", name);
  if (content === null) throw new Error(`模式文件不存在: ${name}`);
  return content;
}

/** 经注册表条目 data.story-bank-template 读取（frontmatter 已剥离）。 */
export function loadInterviewStoryBank(): string {
  return loadRegistryText("data.story-bank-template");
}

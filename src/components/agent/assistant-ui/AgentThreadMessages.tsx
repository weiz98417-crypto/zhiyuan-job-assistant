"use client";

/**
 * Thread 渲染(0.11.0-D2,ADR-0031)。
 *
 * 滚动、消息行、空态由 assistant-ui 原语承担;消息体映射回纸鸢样式:
 * 文本走 AgentResponseRenderer/ReportMessage,工具卡走 ToolUI 注册表,
 * 图片复用 OpenableImage,主责标签与旧壳一致居中展示。
 */

import { ThreadPrimitive, MessagePrimitive } from "@assistant-ui/react";
import type { ThreadMessage } from "@assistant-ui/react";
import { AgentResponseRenderer, isReportMessage, OpenableImage, ReportMessage } from "../AgentDomainCards";
import { AGENT_DATA_RENDERERS, AgentToolCardOverride } from "./AgentToolCards";

function AgentTextPart({ text }: { text: string }) {
  if (!text.trim()) return null;
  return isReportMessage(text) ? <ReportMessage content={text} /> : <AgentResponseRenderer content={text} />;
}

function AgentImagePart({ image }: { image: string }) {
  return (
    <OpenableImage
      src={image}
      alt="上传图片"
      className="max-h-64 max-w-full rounded-[var(--radius-md)] border border-white/25 object-contain bg-white/10"
      name="上传图片"
    />
  );
}

function UserTextPart({ text }: { text: string }) {
  if (!text) return null;
  return <div className="whitespace-pre-wrap break-words">{text}</div>;
}

function AgentUserMessage() {
  return (
    <div className="flex w-full min-w-0 justify-end">
      <div className="max-w-[90%] min-w-0 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-3 text-base leading-relaxed text-[var(--color-surface-raised)] cursor-default">
        <MessagePrimitive.Parts
          components={{
            Text: UserTextPart,
            Image: AgentImagePart,
          }}
        />
      </div>
    </div>
  );
}

function AgentAssistantMessage() {
  return (
    <div className="flex w-full min-w-0 justify-start">
      <div className="max-w-[90%] min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base leading-relaxed text-[var(--color-text)] cursor-default">
        <MessagePrimitive.Parts
          components={{
            Text: AgentTextPart,
            tools: { Override: AgentToolCardOverride },
            data: { by_name: AGENT_DATA_RENDERERS },
          }}
        />
      </div>
    </div>
  );
}

function AgentMessageRow({ message }: { message: ThreadMessage }) {
  const custom = (message.metadata?.custom ?? {}) as { agentLabel?: string };
  return (
    <div data-role={message.role}>
      {custom.agentLabel && (
        <div className="flex justify-center mb-1">
          <span className="text-[10px] text-[var(--color-muted)] opacity-50 tracking-wide">
            {custom.agentLabel}
          </span>
        </div>
      )}
      {message.role === "user" ? <AgentUserMessage /> : <AgentAssistantMessage />}
    </div>
  );
}

/**
 * 消息视口:自动滚动/上翻锁定由 ThreadPrimitive.Viewport 承担(用户故事 4)。
 */
export function AgentThreadMessages() {
  return (
    <ThreadPrimitive.Viewport className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden py-4 space-y-4 cursor-default">
      <ThreadPrimitive.Messages>
        {({ message }) => <AgentMessageRow message={message} />}
      </ThreadPrimitive.Messages>
    </ThreadPrimitive.Viewport>
  );
}

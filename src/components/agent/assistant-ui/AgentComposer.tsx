"use client";

/**
 * Composer(0.11.0-D2 任务 3.3)。
 *
 * Enter 发送 / Shift+Enter 换行 / 自动伸缩 / IME 安全提交由
 * ComposerPrimitive 承担;附件(截图/PDF,≤5 个)、粘贴、草稿与
 * 错误回填维持旧壳交互,由 page 层通过 props 注入。
 */

import { useRef } from "react";
import { ComposerPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { FileText, Plus, Send, Square, X } from "lucide-react";
import { WarmButton } from "@/components/design";
import { OpenableImage } from "../AgentDomainCards";

export interface ComposerAttachment {
  type?: string;
  id: string;
  base64: string;
  previewUrl: string;
  name?: string;
  width?: number;
  height?: number;
  size?: number;
}

interface AgentComposerProps {
  attachments: ComposerAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  /** 运行中(含流尾)显示停止按钮,与旧壳一致以 streaming 为准。 */
  streaming: boolean;
  onStop?: () => void;
  maxAttachments: number;
  /** 评估JD chip 选中后的输入提示。 */
  evalPlaceholder: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function AgentComposer({
  attachments,
  onAddFiles,
  onRemoveAttachment,
  streaming,
  onStop,
  maxAttachments,
  evalPlaceholder,
  textareaRef,
}: AgentComposerProps) {
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="z-20 flex-shrink-0 bg-[var(--color-surface)]/95 pt-3 border-t border-[var(--color-divider)] backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/85">
      {attachments.length > 0 && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          {attachments.map((item, i) => (
            <div key={item.id} className="relative group">
              {item.previewUrl ? (
                <OpenableImage
                  src={item.previewUrl}
                  alt={`截图 ${i + 1}`}
                  className="w-12 h-12 object-cover rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                  name={item.name}
                  meta={item}
                />
              ) : (
                <div className="w-12 h-12 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]">
                  <FileText size={18} className="text-[var(--color-primary)]" />
                </div>
              )}
              <span className="absolute -top-1 -left-1 text-[10px] bg-[var(--color-text)] text-[var(--color-surface)] w-4 h-4 rounded-full flex items-center justify-center">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(item.id)}
                className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`移除附件 ${i + 1}`}
                title={`移除附件 ${i + 1}`}
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <span className="text-xs text-[var(--color-muted)]">共 {attachments.length} 个文件</span>
        </div>
      )}

      <ComposerPrimitive.Root className="flex gap-2 items-end">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isRunning || attachments.length >= maxAttachments}
          className="flex-shrink-0 w-9 h-9 rounded-[var(--radius-md)] border-2 border-dashed flex items-center justify-center transition-all border-[var(--color-divider)] hover:border-[var(--color-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
          title="上传截图或PDF简历"
        >
          <Plus size={16} className="text-[var(--color-muted)]" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,.pdf"
          multiple
          onChange={(event) => {
            if (event.target.files) {
              onAddFiles(Array.from(event.target.files));
              event.target.value = "";
            }
          }}
          className="hidden"
        />
        <ComposerPrimitive.Input
          ref={textareaRef as React.Ref<HTMLTextAreaElement>}
          submitOnEnter={true}
          rows={2}
          placeholder={
            isRunning
              ? "AI 回复中..."
              : evalPlaceholder
                ? "粘贴 JD 文本或链接..."
                : "告诉纸鸢你需要什么，或者随便聊聊..."
          }
          className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)] resize-none disabled:opacity-50 font-[var(--font-body)]"
        />
        {streaming ? (
          <WarmButton
            variant="primary"
            size="md"
            onClick={() => {
              if (onStop) {
                onStop();
              } else {
                aui.thread.cancelRun();
              }
            }}
            disabled={!onStop && !isRunning}
            aria-label="停止回复"
            title="停止回复"
          >
            <Square size={16} />
          </WarmButton>
        ) : (
          <ComposerPrimitive.Send asChild>
            <WarmButton
              variant="primary"
              size="md"
              aria-label="发送消息"
              title="发送消息"
            >
              <Send size={16} />
            </WarmButton>
          </ComposerPrimitive.Send>
        )}
      </ComposerPrimitive.Root>
      <p className="text-xs text-[var(--color-muted)] mt-1.5">
        Enter 发送 · Shift+Enter 换行 · 支持 Ctrl+V 粘贴截图
      </p>
    </div>
  );
}

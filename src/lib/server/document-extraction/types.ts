export type DocumentExtractionErrorCode =
  | "document_text_empty"
  | "document_text_garbled"
  | "mineru_not_configured"
  | "mineru_timeout"
  | "mineru_failed"
  | "doc_conversion_unavailable"
  | "unsupported_file_type";

export type DocumentExtractionMethod =
  | "text"
  | "pdf_text"
  | "docx_text"
  | "mineru"
  | "doc_conversion";

export interface DocumentExtractionDiagnostics {
  fileType: string;
  bytes: number;
  textLength: number;
  mineruUsed: boolean;
  fallbackReason?: DocumentExtractionErrorCode;
  timeoutMs?: number;
}

export interface DocumentExtractionResult {
  text: string;
  method: DocumentExtractionMethod;
  warnings: string[];
  diagnostics: DocumentExtractionDiagnostics;
  fallbackReason?: DocumentExtractionErrorCode;
}

export interface MinerUInput {
  buffer: Buffer;
  filename: string;
  ext: string;
  fallbackReason?: DocumentExtractionErrorCode;
}

export interface LegacyDocConversionResult {
  buffer: Buffer;
  filename: string;
  ext: string;
}

export interface DocumentExtractionDeps {
  extractPdfText?: (buffer: Buffer) => Promise<string>;
  extractDocxText?: (buffer: Buffer) => Promise<string>;
  runMinerU?: (input: MinerUInput) => Promise<string>;
  convertLegacyDoc?: (buffer: Buffer, filename: string) => Promise<LegacyDocConversionResult>;
}

export class DocumentExtractionError extends Error {
  readonly code: DocumentExtractionErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly diagnostics?: Partial<DocumentExtractionDiagnostics>;

  constructor(args: {
    code: DocumentExtractionErrorCode;
    message: string;
    userMessage?: string;
    status?: number;
    diagnostics?: Partial<DocumentExtractionDiagnostics>;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = "DocumentExtractionError";
    this.code = args.code;
    this.status = args.status ?? statusForCode(args.code);
    this.userMessage = args.userMessage ?? defaultUserMessage(args.code);
    this.diagnostics = args.diagnostics;
    if (args.cause) {
      this.cause = args.cause;
    }
  }
}

export function statusForCode(code: DocumentExtractionErrorCode): number {
  switch (code) {
    case "mineru_timeout":
      return 504;
    case "mineru_not_configured":
    case "mineru_failed":
      return 500;
    case "unsupported_file_type":
    case "doc_conversion_unavailable":
    case "document_text_empty":
    case "document_text_garbled":
    default:
      return 400;
  }
}

export function defaultUserMessage(code: DocumentExtractionErrorCode): string {
  switch (code) {
    case "document_text_empty":
      return "未能从文件中提取到有效简历文本，请上传文字版 PDF/DOCX，或直接粘贴简历文本。";
    case "document_text_garbled":
      return "文件文本疑似乱码，请另存为 UTF-8 文本、DOCX 或文字版 PDF 后重新上传。";
    case "mineru_not_configured":
      return "本地 MinerU 尚未配置，扫描件 PDF 暂时无法解析。请配置 MinerU，或上传文字版 PDF/DOCX/文本。";
    case "mineru_timeout":
      return "本地 MinerU 解析超时，请稍后重试，或先上传文字版 PDF/DOCX/文本。";
    case "mineru_failed":
      return "本地 MinerU 解析失败，请检查 MinerU 模型与运行环境，或上传文字版 PDF/DOCX/文本。";
    case "doc_conversion_unavailable":
      return "旧版 .doc 需要本地转换器支持。请将文件另存为 .docx 或 PDF 后重新上传。";
    case "unsupported_file_type":
      return "暂不支持该文件格式，请上传 PDF、DOCX、TXT、MD 或图片格式。";
  }
}

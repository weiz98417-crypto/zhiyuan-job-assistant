"use client";

import { useState } from "react";
import { WarmButton } from "@/components/design";
import {
  inspectLegacyBrowserData,
  listLegacyRecoveryReceipts,
  previewLegacyCvRecovery,
  recoverLegacyCv,
  rollbackLegacyCvRecovery,
  type LegacyBrowserRecord,
  type LegacyCvRecoveryPlan,
  type LegacyCvRecoveryReceipt,
} from "@/lib/browser-legacy-recovery";

export default function LegacyBrowserRecovery() {
  const [records, setRecords] = useState<LegacyBrowserRecord[]>([]);
  const [receipts, setReceipts] = useState<LegacyCvRecoveryReceipt[]>([]);
  const [plan, setPlan] = useState<Extract<LegacyCvRecoveryPlan, { status: "verified" }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = () => {
    setRecords(inspectLegacyBrowserData());
    setReceipts(listLegacyRecoveryReceipts());
  };

  const refreshSafely = () => {
    try { refresh(); } catch (failure) {
      setError(failure instanceof Error ? failure.message : "隔离目录读取失败");
    }
  };

  const act = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try { await operation(); refresh(); } catch (failure) {
      setError(failure instanceof Error ? failure.message : "旧资料恢复失败，原始资料继续隔离保留");
    } finally { setBusy(false); }
  };

  const preview = (record: LegacyBrowserRecord) => act(async () => {
    setPlan(null);
    const result = await previewLegacyCvRecovery(record);
    if (result.status === "verified") {
      setPlan(result);
      setMessage("旧简历与当前账号的云端简历完全一致。核验没有改动资料，可确认恢复；已有不同草稿会阻止覆盖。");
    } else {
      setMessage("这份资料尚未证明属于当前账号，继续保留在隔离区。不会展示正文或加入当前账号。");
    }
  });

  return <details className="mt-4 border-t border-[var(--color-border)] pt-3" onToggle={(event) => { if (event.currentTarget.open) refreshSafely(); }}>
    <summary className="cursor-pointer text-sm">旧缓存隔离与恢复</summary>
    <p className="mt-3 text-xs text-[var(--color-muted)]">这里只展示隔离目录。旧资料正文和旧数据库不参与业务读取；有云端归属证据的简历可以核验后恢复。未同步或证据不足的资料继续保留，待人工核验。</p>
    <p className="mt-2 text-xs text-[var(--color-muted)]">升级前的本地数据库原样保留，本页面不会导入或删除其中的投递、故事和草稿。</p>
    <WarmButton variant="ghost" size="sm" disabled={busy} onClick={refreshSafely}>刷新隔离目录</WarmButton>
    {records.length === 0 ? <p className="mt-2 text-xs">没有可枚举的旧 storage 缓存。旧数据库保留情况不以此判断。</p> :
      <ul className="mt-2 space-y-2">
        {records.map((record) => <li key={record.storage + record.id} className="flex flex-wrap items-center gap-2 text-xs">
          <span>{record.originalKey === "zhiyuan-cv" ? "旧简历缓存" : "旧业务缓存"} · {record.storage === "local" ? "本机" : "当前标签页"} · {record.capturedAt || "时间未知"}</span>
          {record.originalKey === "zhiyuan-cv" ? <WarmButton variant="soft" size="sm" disabled={busy} onClick={() => { void preview(record); }}>核验归属</WarmButton> : <span className="text-[var(--color-muted)]">保留待人工核验</span>}
        </li>)}
      </ul>}
    {message && <p role="status" className="mt-3 text-xs">{message}</p>}
    {error && <p role="alert" className="mt-3 text-xs text-[var(--color-danger)]">{error}</p>}
    {plan && <WarmButton variant="soft" size="sm" disabled={busy} onClick={() => { void act(async () => {
      await recoverLegacyCv(plan);
      setPlan(null);
      setMessage("恢复完成并已读回核验。原始隔离资料保留，云端简历没有改动。");
    }); }}>确认恢复到当前账号</WarmButton>}
    {receipts.length > 0 && <ul className="mt-3 space-y-2">
      {receipts.map((receipt) => <li key={receipt.id} className="flex flex-wrap items-center gap-2 text-xs">
        <span>{receipt.recoveredAt} · {receipt.status === "rolled_back" ? "已撤销恢复" : "恢复已核验"}</span>
        {receipt.status === "restored" && <WarmButton variant="ghost" size="sm" disabled={busy} onClick={() => { void act(async () => {
          await rollbackLegacyCvRecovery(receipt.id);
          setMessage("本次恢复已撤销；后续新资料和原始隔离资料均受保护。");
        }); }}>撤销本次恢复</WarmButton>}
      </li>)}
    </ul>}
  </details>;
}

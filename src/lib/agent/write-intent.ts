export type NegatedWriteTarget = "resume" | "profile" | "reference_resume";

const NEGATION = "(?:不要|不用|无需|不需要|不必|别|禁止|取消)";
const WRITE_ACTION = "(?:自动|静默)?(?:优化|修改|改写|润色|重写|生成|创建|保存|写入|应用|撤销|回滚|导入|同步|替换|记录|沉淀|提取|刷新|完善|加入|建立)";

const SUBJECTS: Record<NegatedWriteTarget, string> = {
  resume: "(?:我的|当前|现在|已有)?(?:简历|履历|resume|cv)",
  profile: "(?:求职画像|职业画像|个人画像|画像|profile)",
  reference_resume: "(?:优秀|参考|标杆|样例|范例)(?:简历|履历|resume|cv)",
};

export function detectNegatedWriteIntent(content: string): NegatedWriteTarget | null {
  const text = content.replace(/\s+/g, "").trim();
  if (!text) return null;
  const targets = ["reference_resume", "profile", "resume"] as const;
  for (const target of targets) {
    const subject = SUBJECTS[target];
    const patterns = [
      new RegExp(`${NEGATION}.{0,10}${WRITE_ACTION}.{0,16}${subject}`, "i"),
      new RegExp(`${NEGATION}.{0,10}${subject}.{0,16}${WRITE_ACTION}`, "i"),
      new RegExp(`${subject}.{0,12}${NEGATION}.{0,10}${WRITE_ACTION}`, "i"),
    ];
    if (patterns.some((pattern) => pattern.test(text))) return target;
  }
  if (new RegExp(`${NEGATION}.{0,10}${WRITE_ACTION}`, "i").test(text)) {
    const mentionedTargets = targets.filter((target) => new RegExp(SUBJECTS[target], "i").test(text));
    if (mentionedTargets.length === 1) return mentionedTargets[0];
  }
  return null;
}

export function hasResumeWriteIntent(content: string): boolean {
  if (detectNegatedWriteIntent(content) === "resume") return false;
  return /(优化|修改|改写|润色|重写|生成|创建|保存|写入|应用|用这个|撤销|回滚|导入|同步|替换).{0,16}(简历|履历|resume|cv)|(简历|履历|resume|cv).{0,16}(优化|修改|改写|润色|重写|生成|创建|保存|写入|应用|用这个|撤销|回滚|导入|同步|替换)/i.test(content);
}

export function hasProfileWriteIntent(content: string): boolean {
  if (detectNegatedWriteIntent(content) === "profile") return false;
  return /(更新|保存|写入|记录|沉淀|提取|同步|刷新|完善|加入|修改|生成|建立|做).{0,16}(求职画像|职业画像|个人画像|画像|profile)|(求职画像|职业画像|个人画像|画像|profile).{0,16}(更新|保存|写入|记录|沉淀|提取|同步|刷新|完善|加入|修改|生成|建立)/i.test(content);
}

export function hasReferenceResumeSaveIntent(content: string): boolean {
  if (detectNegatedWriteIntent(content) === "reference_resume") return false;
  return /(保存|存|沉淀|加入|放到).{0,20}(优秀|参考|标杆|样例|范例).{0,20}(简历|履历|resume|cv)|(优秀|参考|标杆|样例|范例).{0,20}(简历|履历|resume|cv).{0,20}(保存|存|沉淀|加入|放到)/i.test(content);
}

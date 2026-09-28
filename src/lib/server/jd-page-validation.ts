export const JD_VERIFICATION_PAGE_ERROR = "招聘网站要求人机验证，无法自动读取 JD；请打开原链接并粘贴职位描述";

export function isJDVerificationPage(title: string, text: string): boolean {
  const pageTitle = title.replace(/\s+/g, " ").trim();
  const pageText = text.replace(/\s+/g, " ").trim();
  const hasJDStructure = /(?:岗位职责|职位描述|工作职责|工作内容|任职要求|职位要求)\s*[:：]/.test(pageText);

  if (/^(?:(?:请(?:先|完成|进行)|正在进行).{0,12})?(?:滑动验证|安全验证|人机验证|访问验证|验证码)(?:页面|中心)?(?:\s*[-|—].*)?$/i.test(pageTitle)) return true;
  if (/^(?:captcha|robot check|access denied|just a moment\.{0,3}|verify you are human|security check)(?:\s*[-|—].*)?$/i.test(pageTitle)) return true;

  return /(?:CF_APP_WAF|appkey:\s*["']?CF_APP_WAF|var\s+AC_Opt\s*=)/i.test(pageText)
    || /为了更好的访问体验.{0,20}请进行验证/.test(pageText)
    || (!hasJDStructure && /(?:请|需要).{0,20}(?:拖动|滑动).{0,25}(?:滑块|拼图|验证)/.test(pageText))
    || (!hasJDStructure && /(?:请|需要).{0,20}(?:完成|进行).{0,15}(?:滑动验证|安全验证|人机验证|访问验证|验证码验证)/.test(pageText))
    || /(?:访问|请求).{0,15}(?:异常|频繁).{0,50}(?:验证|访问)/.test(pageText)
    || /(?:verify you are human|complete (?:the )?captcha|drag (?:the )?slider|checking your browser|unusual traffic)/i.test(pageText);
}

export function assertReadableJDPage(title: string, text: string): void {
  if (isJDVerificationPage(title, text)) throw new Error(JD_VERIFICATION_PAGE_ERROR);
}

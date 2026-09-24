export function inferJDResumeMatchingDirective(content: string): boolean | undefined {
  const text = content.trim();
  if (/(?:不要|不需要|无需|别|禁止|停止|取消|不要再|不用).{0,16}(?:匹配|对照|结合|比较|读取|参考).{0,12}(?:我的|本人|个人)?(?:简历|履历|CV|resume)|(?:不是我求职|不是我应聘|我不求职)|(?:不匹配|不对照|不结合|不比较|不读取|不参考).{0,8}(?:我的|本人|个人)?(?:简历|履历|CV|resume)/i.test(text)) return false;
  if (/(?:改为|现在|重新|可以|请|要|需要|继续).{0,16}(?:匹配|对照|结合|比较).{0,12}(?:我的|本人|个人)?(?:简历|履历|CV|resume)/i.test(text)) return true;
  return undefined;
}

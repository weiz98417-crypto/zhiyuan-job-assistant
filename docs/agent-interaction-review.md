# Agent Interaction Review

## 2026-05-22 JD Evaluation Log

| User intent | Agent/tool choice | Tool result | Should continue? | Display boundary | Root cause | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| "结合我的简历重新评估这份JD" after a network interruption | Asked user to confirm reconstructed JD, then ran full evaluation without reading resume | Report #5 saved with B block "待提供简历" | No. It should read the saved resume first, then evaluate once | Violated: full A-G report streamed into chat | Evaluate agent did not have `read_file`/`get_profile`; tool result fed full report back to chat | Evaluate agent now has `read_file`, `get_profile`, `get_recent_jd_context`; `get_report_detail` LLM context is summary only |
| "公司是字节，而且我有简历啊" | Tried `update_report_metadata`, but current Agent whitelist rejected it | Tool blocked, then assistant continued conversationally | No. Tool availability should match prompt | OK-ish, but answer proposed rerun too eagerly | Prompt listed a tool not actually usable in active mode/session | `update_report_metadata` registered and whitelisted; policy says metadata update does not trigger evaluation |
| "你读不到我的简历？" | Read file, then produced a detailed new assessment in chat | Resume was found | Yes, but should not claim complete report unless persisted | Violated: long analysis in chat, no clear saved report boundary | Resume read was reactive, not part of original evaluation flow | AgentContextState records resume intent; workflow requires reading resume before evaluation |
| "现在根据我的简历对这个JD做个完整的评估啊" | Called `fetch_jd_content` on stale/inaccessible link | Fetch failed and asked user to paste JD again | No. It should read recent saved JD first | OK, but wrong recovery | No local recent-JD tool; failure recovery encouraged link fetching | Added `get_recent_jd_context`; policy blocks fetch without a fresh URL |

## 2026-05-22 Interview Preparation Log

| User intent | Agent/tool choice | Tool result | Should continue? | Display boundary | Root cause | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| "这个JD需要考察代码吗？我重点应该准备什么" | Repeated `web_search`, partial `read_file`, `search_applications`; then jumped to generic interview coach greeting | Search/read/query results mixed;投递记录 not found | No. It should read recent JD + resume, then answer preparation priorities | Violated: noisy tool transcript, no useful answer | Interview agent had `web_search` in whitelist despite prompt saying forbidden; "这个JD" did not map to local JD context | Removed `web_search` from default interview tools; added `get_recent_jd_context`; policy blocks unsolicited search; prompt distinguishes "prep advice" from "generate questions" |

## Regression Scenarios

1. User sends JD -> one `evaluate_jd_full` -> chat summary only.
2. User says "这是字节的 JD" -> `update_report_metadata` only, no re-evaluation.
3. User says "看完整报告" -> report card/detail link, no full A-G dump in chat.
4. User says "修改已保存报告" -> no search, no evaluation.
5. User explicitly says "搜一下面经/联网查公司背景" -> search allowed only in a search-enabled flow.
6. User asks "刚才那个 JD" -> `get_recent_jd_context` or report context before asking user to paste again.
7. User asks "这个 JD 需要考代码吗，重点准备什么" -> recent JD + resume context, no default web search, no automatic question generation.

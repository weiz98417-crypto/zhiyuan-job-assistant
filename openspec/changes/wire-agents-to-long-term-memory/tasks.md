## 1. Memory Context Assembler

- [ ] 1.1 Define task types and allowed source filters for JD, offer, resume, interview, profile, and general chat.
- [ ] 1.2 Build a context assembler that reads structured facts first.
- [ ] 1.3 Add semantic retrieval with top-k, recency, confidence, and source-type filters.
- [ ] 1.4 Add context budget and source labeling.

## 2. Tool Integration

- [ ] 2.1 Update `get_profile` to read confirmed profile facts and relevant candidates.
- [ ] 2.2 Update `get_recent_jd_context` to include saved JD/report memory.
- [ ] 2.3 Update `detect_skill_gaps` to use resume/JD structured facts and semantic snippets.
- [ ] 2.4 Update JD and offer evaluation tools to persist and retrieve relevant memory.
- [ ] 2.5 Update resume tools to retrieve target JD, reference resumes, and writing preferences.

## 3. Interview Integration

- [ ] 3.1 Bind interview sessions to JD, resume, and report snapshot ids.
- [ ] 3.2 Ensure every generated question uses the bound snapshots unless the user explicitly rebinds.
- [ ] 3.3 Add per-answer writeback for observed strengths, gaps, and follow-up needs as candidate memory.
- [ ] 3.4 Keep one-question-at-a-time behavior compatible with retrieved context.

## 4. Tests

- [ ] 4.1 Test JD evaluation retrieves resume and historical report context.
- [ ] 4.2 Test offer evaluation retrieves compensation preferences and prior offer context.
- [ ] 4.3 Test interview does not forget the bound JD/resume after user correction.
- [ ] 4.4 Test agent retrieval never returns another user's memory.
- [ ] 4.5 Test writeback creates candidate memory, not confirmed profile facts.
- [ ] 4.6 Validate this OpenSpec change.

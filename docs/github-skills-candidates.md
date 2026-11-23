# GitHub Agent Skills — discovery register

Updated 2026-11-23. This is a **review queue**, not a list of installed or security-certified packages.

## Scope
- Source: [github/awesome-copilot](https://github.com/github/awesome-copilot), repository root MIT license (verify individual package and dependencies before reuse).
- Source pointers below are GitHub blob identifiers of the entry `SKILL.md`, not a complete cryptographic inventory of the package.
- All eight entry files have been read; only the first package's additional Python scripts were enumerated, with `stage_install.py` inspected in detail. No third-party executable was run.
- No direct third-party package was installed; instead use original repository-scoped instructions and retain attribution when needed.

| Entry skill | Blob SHA for SKILL.md | Project relevance | Additional package review still required |
| --- | --- | --- | --- |
| `agent-skill-stack` | `e89c861c51f249247ec923e0e8fa69251d3c169e` | Skill orchestration | 5 Python scripts, 4 reference docs, 1 agent config; execution and dependency tests pending |
| `agent-governance` | `a3c2501676c11fd8433c802b7f1c21d174ff6721` | MCP/agent permissions | Review examples and agent policy compatibility |
| `agent-supply-chain` | `995c87835577fc396d31ff4447cea9d91ca61484` | Integrity and version verification | Validate manifest scheme and test against fixtures |
| `gsap-framer-scroll-animation` | `dfb3a84fde584080ce17938d014aaa049eae4c5f` | Website animation | 2 large references and runtime dependency compatibility |
| `web-design-reviewer` | `21764d37e99e24b2f4f0df3ea9fbbe099f0b739b` | Responsive UI QA | 2 references, browser permissions and real fixture |
| `generate-image` | `21cd4d72561879ed94764849f1be7ee5ae7f2d81` | AI imagery | Requires provider API keys and may incur cost; NOT auto-enable |
| `webmcpify` | `a5cbee9e7ad35989f9f7e86f3f8d943b31dd1b92` | Site agent interfaces | Scripts, templates and tests; scope changes user-facing actions |
| `qdrant-search-quality` | `c322b65e7f1d6ce8f979dd5dc34eb85a22069a00` | Search/translation | Nested diagnosis and strategy files; only use if Qdrant exists |

## Deployment states
- **Read-only source review:** entry files and portions of package structure retrieved.
- **Original project-specific instructions:** `github-skill-sourcing`, `uvmall-catalog-qa` and `uvmusic-catalog-qa` staged in this PR.
- **Behavior-tested installed third-party packages:** **zero**.
- **ChatGPT global plugin activation:** unrelated to merging these repository skills.

## Required gates before adoption
Exact upstream revision and per-file licensing → complete referenced-script audit → duplicate/conflict check → sandbox fixture tests → stage on isolated branch → reviewer approval → merge → agent discovery/readback and behavior test. Never use search-result counts as installation counts.

## Additional official publishers — discovered, not adopted

These six *official-publisher* candidates were verified by GitHub directory listing on 2026-11-23. Each directory contains its own `LICENSE.txt`, but the license terms, references, scripts, dependencies and runtime compatibility have **not** yet been fully audited. The SHAs below identify **only the SKILL.md file**, not the whole package.

| Publisher / source path | SKILL.md blob SHA | Project use | Status |
| --- | --- | --- | --- |
| `openai/skills/skills/.curated/gh-fix-ci` | `76bdeb6a7bff93cbe924c0652f1fd7a3c3ffc46c` | Existing CI triage | Discovery only; code/scripts pending |
| `openai/skills/skills/.curated/security-best-practices` | `45ccbd8d671c4c4cc3e7e0645a16a3f80ec50de7` | App security review | Discovery only; references pending |
| `openai/skills/skills/.curated/playwright` | `77c01afb31aa602d0b002ae2438c2b67f0335fcb` | Browser checks | Discovery only; assets/scripts/notice pending |
| `anthropics/skills/skills/mcp-builder` | `d61a9056202a0f8b2d064c896e62f415c45b1bf1` | MCP engineering | Discovery only; scripts pending |
| `anthropics/skills/skills/skill-creator` | `65b3a402dbd09b8e83f9d637c6b553875189085c` | Skill evaluation | Discovery only; complex assets/scripts pending |
| `anthropics/skills/skills/webapp-testing` | `4726215301db64a0cc4d41fc3219c61f37a30f4a` | Site validation | Discovery only; examples/scripts pending |

**Source roots:** https://github.com/openai/skills and https://github.com/anthropics/skills. These directories are not ChatGPT plugin installations. Prefer already-authorized, functionally equivalent tools rather than duplicating them.

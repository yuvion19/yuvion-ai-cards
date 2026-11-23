# GitHub Agent Skills — discovery register

Updated 2026-11-23. This is a **review queue**, not a list of installed or security-certified packages.

## Scope
- Source: [github/awesome-copilot](https://github.com/github/awesome-copilot), repository root MIT license (verify individual package and dependencies before reuse).
- Source pointers below are GitHub blob identifiers of the entry \`SKILL.md\`, not a complete cryptographic inventory of the package.
- All eight entry files have been read; only the first package's additional Python scripts were enumerated, with \`stage_install.py\` inspected in detail. No third-party executable was run.
- No direct third-party package was installed; instead use original repository-scoped instructions and retain attribution when needed.

| Entry skill | Blob SHA for SKILL.md | Project relevance | Additional package review still required |
| --- | --- | --- | --- |
| \`agent-skill-stack\` | \`e89c861c51f249247ec923e0e8fa69251d3c169e\` | Skill orchestration | 5 Python scripts, 4 reference docs, 1 agent config; execution and dependency tests pending |
| \`agent-governance\` | \`a3c2501676c11fd8433c802b7f1c21d174ff6721\` | MCP/agent permissions | Review examples and agent policy compatibility |
| \`agent-supply-chain\` | \`995c87835577fc396d31ff4447cea9d91ca61484\` | Integrity and version verification | Validate manifest scheme and test against fixtures |
| \`gsap-framer-scroll-animation\` | \`dfb3a84fde584080ce17938d014aaa049eae4c5f\` | Website animation | 2 large references and runtime dependency compatibility |
| \`web-design-reviewer\` | \`21764d37e99e24b2f4f0df3ea9fbbe099f0b739b\` | Responsive UI QA | 2 references, browser permissions and real fixture |
| \`generate-image\` | \`21cd4d72561879ed94764849f1be7ee5ae7f2d81\` | AI imagery | Requires provider API keys and may incur cost; NOT auto-enable |
| \`webmcpify\` | \`a5cbee9e7ad35989f9f7e86f3f8d943b31dd1b92\` | Site agent interfaces | Scripts, templates and tests; scope changes user-facing actions |
| \`qdrant-search-quality\` | \`c322b65e7f1d6ce8f979dd5dc34eb85a22069a00\` | Search/translation | Nested diagnosis and strategy files; only use if Qdrant exists |

## Deployment states
- **Read-only source review:** entry files and portions of package structure retrieved.
- **Original project-specific instructions:** \`github-skill-sourcing\`, \`uvmall-catalog-qa\` and \`uvmusic-catalog-qa\` staged in this PR.
- **Behavior-tested installed third-party packages:** **zero**.
- **ChatGPT global plugin activation:** unrelated to merging these repository skills.

## Required gates before adoption
Exact upstream revision and per-file licensing → complete referenced-script audit → duplicate/conflict check → sandbox fixture tests → stage on isolated branch → reviewer approval → merge → agent discovery/readback and behavior test. Never use search-result counts as installation counts.

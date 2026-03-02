# Web3 扩展与 OpenClaw 架构契合度评估报告

**评估日期**: 2026-02-26
**评估对象**: `extensions/web3-core`, `extensions/market-core` 及相关 Overlay 集成
**评估标准**: 基于 `private/PRIVATE_FORK_PLAYBOOK.md` 定义的 "Private Fork" 及 "Overlay Hooks" 规范

## 1. 总体结论

**契合度评分**: ⭐⭐⭐⭐⭐ (5/5)

Web3 扩展体系展现了极高的架构契合度。它不仅作为独立功能模块存在，更严格遵循了 OpenClaw 的 "Overlay Hooks" 设计模式，将对上游核心代码的侵入性降至理论最低值（仅限于 import + spread）。这种设计确保了 Web3 能力可以随 OpenClaw 核心快速迭代，同时保持私有业务逻辑的完全隔离。

## 2. 架构一致性分析

### 2.1 Extension-first (扩展优先) 策略

- **验证结果**: ✅ 符合
- **分析**:
  - Web3 核心逻辑完全封装在 `extensions/web3-core` 和 `extensions/market-core` 两个独立的工作区包中。
  - `web3-core` 拥有独立的 `package.json`，依赖管理清晰（`ethers`, `viem`, `siwe`, `arweave` 等），未污染根目录依赖。
  - 模块间通信通过明确的接口进行，无隐式耦合。

### 2.2 Overlay Pattern (覆盖层模式)

- **验证结果**: ✅ 完美符合
- **分析**:
  - 项目严格执行了 "Merge Magnet"（合并磁铁文件）的防冲突策略。
  - 核心文件修改仅限于“挂载点”注入，未内联任何业务逻辑。

| 核心文件 (Upstream)            | Overlay 文件 (Web3)                 | 集成方式                                  | 冲突风险 |
| :----------------------------- | :---------------------------------- | :---------------------------------------- | :------- |
| `src/gateway/method-scopes.ts` | `src/gateway/method-scopes-web3.ts` | Import + Spread (`...WEB3_SCOPE_ENTRIES`) | 极低     |
| `ui/src/ui/tab-registry.ts`    | `ui/src/ui/tab-registry-web3.ts`    | Import + Spread (`...WEB3_TAB_ENTRIES`)   | 极低     |
| `ui/src/ui/types.ts`           | `ui/src/ui/types-web3.ts`           | Re-export (`export type ... from ...`)    | 极低     |
| `src/commands/status.scan.ts`  | `src/commands/status-scan-web3.ts`  | Import + Function Call                    | 极低     |

## 3. 代码质量与隔离性审计

### 3.1 依赖规范性 (`extensions/web3-core/package.json`)

- **状态**: 健康
- **详情**:
  - 使用标准的 Web3 协议栈库。
  - `openclaw` 核心库通过 `workspace:*` 引用，符合 Monorepo 开发规范。
  - 无相对路径引用其他 Extension，保证了包的可移植性。

### 3.2 测试覆盖度

- **状态**: 覆盖全面
- **web3-core**: 29 个测试文件，覆盖核心模块：
  - 基础设施: `config`, `errors`, `storage`, `chain`
  - 业务逻辑: `billing`, `brain`, `disputes`, `identity`, `market`
  - E2E/集成: `resources/indexer-flow.e2e.test.ts`
- **market-core**: 11 个测试文件，覆盖市场机制：
  - 核心流程: `e2e-flow.e2e.test.ts`
  - 交易处理: `settlement`, `pricing-engine`, `revocation`
  - 状态管理: `store.test.ts`

### 3.3 目录结构

- 结构清晰，职责分明。`web3-core` 负责底层协议与网关集成，`market-core` 负责上层市场业务逻辑与状态机，符合“关注点分离”原则。

## 4. 风险评估与建议

### 潜在风险

1. **Workspace 依赖发布**: `package.json` 中对 `openclaw` 的 `workspace:*` 引用在独立发布（Publish）时需要替换为具体版本号。当前作为私有包（`private: true`）在 Monorepo 内使用是安全的。
2. **Overlay 接口稳定性**: 虽然 Overlay 模式降低了冲突，但若上游核心重构了 `method-scopes` 或 `tab-registry` 的数据结构，Overlay 文件仍需适配。

### 建议

- **持续集成**: 建议在 CI 流程中增加专门针对 Overlay 文件的接口兼容性检查。
- **文档同步**: 保持 `SKILL.md` 与代码实现的同步更新，特别是随着 `web3-market` 功能的扩展。

## 5. 总结

Web3 扩展是 OpenClaw 生态中高质量扩展的典范。它证明了即使是深度集成的功能（如修改网关权限、增加 UI 标签页），也可以通过优雅的架构设计实现“零侵入”式的扩展。这套架构模式值得在其他私有扩展中推广。

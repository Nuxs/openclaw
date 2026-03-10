// Copyright (c) OpenClaw Contributors
// SPDX-License-Identifier: Apache-2.0

/// # openclaw_market
///
/// 市场模块 —— 定义 Capability / Lease / Receipt / MarketRegistry 四件套。
///
/// ## 设计原则
/// - Capability / Lease / Receipt 为 Owned Object（key, store），走低冲突路径
/// - MarketRegistry 为唯一 Shared Object，仅在发布/撤下时触及
/// - 敏感引用一律用 SHA-256 hash（vector<u8>），链上零泄露
/// - 状态以 u8 常量表示，assert 强制单向跃迁
module openclaw_protocol::openclaw_market {

    // ══════════════════════════════════════════════════════════════════
    // Dependencies
    // ══════════════════════════════════════════════════════════════════

    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::clock::{Self, Clock};

    // friend 声明：允许 escrow 模块调用内部函数
    friend openclaw_protocol::openclaw_escrow;

    // ══════════════════════════════════════════════════════════════════
    // Status Constants — Capability
    // ══════════════════════════════════════════════════════════════════

    const STATUS_CAP_ACTIVE: u8    = 1;
    const STATUS_CAP_REVOKED: u8   = 2;

    // ══════════════════════════════════════════════════════════════════
    // Status Constants — Lease
    // ══════════════════════════════════════════════════════════════════

    const STATUS_LEASE_ACTIVE: u8    = 1;
    const STATUS_LEASE_COMPLETED: u8 = 2;
    const STATUS_LEASE_EXPIRED: u8   = 3;
    const STATUS_LEASE_REVOKED: u8   = 4;
    const STATUS_LEASE_DISPUTED: u8  = 5;

    // ══════════════════════════════════════════════════════════════════
    // Status Constants — Receipt
    // ══════════════════════════════════════════════════════════════════

    const STATUS_RECEIPT_PENDING: u8  = 1;
    const STATUS_RECEIPT_ACCEPTED: u8 = 2;
    const STATUS_RECEIPT_REJECTED: u8 = 3;

    // ══════════════════════════════════════════════════════════════════
    // Error Codes
    // ══════════════════════════════════════════════════════════════════

    const E_NOT_PUBLISHER: u64        = 0;
    const E_NOT_ACTIVE: u64           = 1;
    const E_NOT_LESSOR: u64           = 2;
    const E_NOT_LESSEE: u64           = 3;
    const E_LEASE_NOT_ACTIVE: u64     = 4;
    const E_RECEIPT_NOT_PENDING: u64  = 5;
    const E_INVALID_EXPIRE: u64       = 6;

    // ══════════════════════════════════════════════════════════════════
    // Core Objects
    // ══════════════════════════════════════════════════════════════════

    /// Capability — 表达"卖的到底是什么能力"
    ///
    /// Owned Object：由 publisher 持有。
    /// 不变量：不直接暴露 endpoint / token / 真实路径，
    ///         对外仅描述能力摘要（hash / category / policy ref）。
    struct Capability has key, store {
        id: UID,
        /// 能力发布者
        publisher: address,
        /// 能力品类：model | embedding | rerank | tool | dataset | compute-slot
        category: vector<u8>,
        /// 服务引用 SHA-256 摘要（链下可验证，链上不泄露）
        service_ref_hash: vector<u8>,
        /// 定价策略引用 hash
        pricing_policy_ref: vector<u8>,
        /// 可见性策略标识
        visibility_policy: u8,
        /// SLA 策略引用 hash
        sla_policy_ref: vector<u8>,
        /// 结算资产策略标识
        settlement_asset_policy: u8,
        /// 元数据 hash（描述 / 名称 / 版本等链下信封的摘要）
        metadata_hash: vector<u8>,
        /// 状态：STATUS_CAP_ACTIVE | STATUS_CAP_REVOKED
        status: u8,
    }

    /// Lease — 表达"谁在什么条件下、多久之内、以什么预算，获得什么访问权"
    ///
    /// Owned Object：由 lessee 持有。
    /// 不变量：明文秘密不应长期驻留链上，链上仅保留引用 hash。
    struct Lease has key, store {
        id: UID,
        /// 所租用 Capability 的 object address
        capability_id: address,
        /// 出租方
        lessor: address,
        /// 承租方
        lessee: address,
        /// 租约起始 Unix 毫秒时间戳
        start_at: u64,
        /// 租约到期 Unix 毫秒时间戳
        expire_at: u64,
        /// 用量预算（以结算资产最小单位计）
        usage_budget: u64,
        /// 允许的操作范围标识
        allowed_scopes: vector<u8>,
        /// 凭证交付引用 hash（链下加密交付确认摘要）
        credential_delivery_ref_hash: vector<u8>,
        /// 关联的 Escrow object address
        escrow_id: address,
        /// 撤销策略标识
        revocation_policy: u8,
        /// 争议窗口（秒）
        dispute_window_sec: u64,
        /// 状态
        status: u8,
    }

    /// Receipt — 表达"某次能力调用或任务交付已经发生"
    ///
    /// Owned Object：由 executor 创建，可被 lessee 验收。
    /// 不变量：回执是可追溯摘要，不是大结果容器。
    struct Receipt has key, store {
        id: UID,
        /// 关联 Lease 的 object address
        lease_id: address,
        /// 执行者
        executor: address,
        /// 用量摘要 hash
        usage_summary_hash: vector<u8>,
        /// 结果指针 hash（指向链下交付大对象）
        result_pointer_hash: vector<u8>,
        /// 证明引用 hash（zkp / attestation / 签名包络）
        proof_ref_hash: vector<u8>,
        /// 完成 Unix 毫秒时间戳
        completed_at: u64,
        /// 验收者（接受后写入）
        accepted_by: address,
        /// 审计锚引用 hash
        audit_anchor_ref: vector<u8>,
        /// 状态
        status: u8,
    }

    /// MarketRegistry — 全局能力索引锚点
    ///
    /// **唯一 Shared Object**：仅在发布 / 撤下能力时被修改，
    /// 避免把热交易压入共享对象。
    struct MarketRegistry has key {
        id: UID,
        /// 已注册 Capability 数量
        capability_count: u64,
    }

    // ══════════════════════════════════════════════════════════════════
    // Events
    // ══════════════════════════════════════════════════════════════════

    /// 能力已发布事件
    struct CapabilityPublished has copy, drop {
        capability_id: address,
        publisher: address,
        category: vector<u8>,
        metadata_hash: vector<u8>,
    }

    /// 能力已撤下事件
    struct CapabilityRevoked has copy, drop {
        capability_id: address,
        publisher: address,
    }

    /// 租约已创建事件
    struct LeaseCreated has copy, drop {
        lease_id: address,
        capability_id: address,
        lessor: address,
        lessee: address,
        escrow_id: address,
        expire_at: u64,
        usage_budget: u64,
    }

    /// 回执已提交事件
    struct ReceiptSubmitted has copy, drop {
        receipt_id: address,
        lease_id: address,
        executor: address,
        usage_summary_hash: vector<u8>,
    }

    /// 回执已验收事件
    struct ReceiptAccepted has copy, drop {
        receipt_id: address,
        accepted_by: address,
    }

    // ══════════════════════════════════════════════════════════════════
    // Init — MarketRegistry 创建（one-time）
    // ══════════════════════════════════════════════════════════════════

    /// 模块初始化：创建 MarketRegistry Shared Object
    fun init(ctx: &mut TxContext) {
        let registry = MarketRegistry {
            id: object::new(ctx),
            capability_count: 0,
        };
        transfer::share_object(registry);
    }

    // ══════════════════════════════════════════════════════════════════
    // Entry Functions — Capability
    // ══════════════════════════════════════════════════════════════════

    /// 发布一个新的能力对象并注册到全局索引
    ///
    /// # 参数
    /// - `registry`: MarketRegistry 共享对象引用
    /// - `category`: 能力品类
    /// - `service_ref_hash`: 服务引用摘要
    /// - `pricing_policy_ref`: 定价策略引用
    /// - `visibility_policy`: 可见性标识
    /// - `sla_policy_ref`: SLA 引用
    /// - `settlement_asset_policy`: 结算资产标识
    /// - `metadata_hash`: 元数据摘要
    public entry fun publish_capability(
        registry: &mut MarketRegistry,
        category: vector<u8>,
        service_ref_hash: vector<u8>,
        pricing_policy_ref: vector<u8>,
        visibility_policy: u8,
        sla_policy_ref: vector<u8>,
        settlement_asset_policy: u8,
        metadata_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let publisher = tx_context::sender(ctx);
        let cap = Capability {
            id: object::new(ctx),
            publisher,
            category,
            service_ref_hash,
            pricing_policy_ref,
            visibility_policy,
            sla_policy_ref,
            settlement_asset_policy,
            metadata_hash,
            status: STATUS_CAP_ACTIVE,
        };

        // 更新全局索引计数
        registry.capability_count = registry.capability_count + 1;

        // 发射事件
        event::emit(CapabilityPublished {
            capability_id: object::uid_to_address(&cap.id),
            publisher,
            category: cap.category,
            metadata_hash: cap.metadata_hash,
        });

        // Capability 归发布者所有
        transfer::transfer(cap, publisher);
    }

    /// 撤下一个已发布的能力（仅 publisher 可操作）
    public entry fun revoke_capability(
        registry: &mut MarketRegistry,
        cap: &mut Capability,
        ctx: &mut TxContext,
    ) {
        // 权限校验
        assert!(cap.publisher == tx_context::sender(ctx), E_NOT_PUBLISHER);
        assert!(cap.status == STATUS_CAP_ACTIVE, E_NOT_ACTIVE);

        cap.status = STATUS_CAP_REVOKED;

        // 更新索引计数
        assert!(registry.capability_count > 0, E_NOT_ACTIVE);
        registry.capability_count = registry.capability_count - 1;

        event::emit(CapabilityRevoked {
            capability_id: object::uid_to_address(&cap.id),
            publisher: cap.publisher,
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // Entry Functions — Lease
    // ══════════════════════════════════════════════════════════════════

    /// 创建租约（配合 Escrow 在 PTB 中原子组合）
    ///
    /// 在典型 PTB 中，此函数与 `openclaw_escrow::create_escrow` 一起调用，
    /// 实现"签发租约 + 锁定资金"的原子操作。
    ///
    /// # 参数
    /// - `capability_id`: 所租用的 Capability object address
    /// - `lessor`: 出租方地址
    /// - `expire_at`: 到期时间戳（ms）
    /// - `usage_budget`: 用量预算
    /// - `allowed_scopes`: 允许操作范围
    /// - `credential_delivery_ref_hash`: 凭证交付引用
    /// - `escrow_id`: 关联 Escrow object address
    /// - `revocation_policy`: 撤销策略
    /// - `dispute_window_sec`: 争议窗口秒数
    /// - `clock`: 链上时钟
    public entry fun create_lease(
        capability_id: address,
        lessor: address,
        expire_at: u64,
        usage_budget: u64,
        allowed_scopes: vector<u8>,
        credential_delivery_ref_hash: vector<u8>,
        escrow_id: address,
        revocation_policy: u8,
        dispute_window_sec: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        assert!(expire_at > now, E_INVALID_EXPIRE);

        let lessee = tx_context::sender(ctx);

        let lease = Lease {
            id: object::new(ctx),
            capability_id,
            lessor,
            lessee,
            start_at: now,
            expire_at,
            usage_budget,
            allowed_scopes,
            credential_delivery_ref_hash,
            escrow_id,
            revocation_policy,
            dispute_window_sec,
            status: STATUS_LEASE_ACTIVE,
        };

        event::emit(LeaseCreated {
            lease_id: object::uid_to_address(&lease.id),
            capability_id,
            lessor,
            lessee,
            escrow_id,
            expire_at,
            usage_budget,
        });

        // Lease 归 lessee 所有
        transfer::transfer(lease, lessee);
    }

    // ══════════════════════════════════════════════════════════════════
    // Entry Functions — Receipt
    // ══════════════════════════════════════════════════════════════════

    /// 提交执行回执
    ///
    /// 由执行者（Provider）调用，提交能力调用 / 任务交付的可审计摘要。
    public entry fun submit_receipt(
        lease: &Lease,
        usage_summary_hash: vector<u8>,
        result_pointer_hash: vector<u8>,
        proof_ref_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(lease.status == STATUS_LEASE_ACTIVE, E_LEASE_NOT_ACTIVE);

        let executor = tx_context::sender(ctx);
        let now = clock::timestamp_ms(clock);

        let receipt = Receipt {
            id: object::new(ctx),
            lease_id: object::uid_to_address(&lease.id),
            executor,
            usage_summary_hash,
            result_pointer_hash,
            proof_ref_hash,
            completed_at: now,
            accepted_by: @0x0,   // 尚未验收
            audit_anchor_ref: vector::empty(),
            status: STATUS_RECEIPT_PENDING,
        };

        event::emit(ReceiptSubmitted {
            receipt_id: object::uid_to_address(&receipt.id),
            lease_id: receipt.lease_id,
            executor,
            usage_summary_hash: receipt.usage_summary_hash,
        });

        // Receipt 暂归 executor，后续可 transfer 给 lessee 验收
        transfer::transfer(receipt, executor);
    }

    /// 验收回执（由 lessee 调用）
    public entry fun accept_receipt(
        receipt: &mut Receipt,
        audit_anchor_ref: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(receipt.status == STATUS_RECEIPT_PENDING, E_RECEIPT_NOT_PENDING);

        let acceptor = tx_context::sender(ctx);
        receipt.accepted_by = acceptor;
        receipt.audit_anchor_ref = audit_anchor_ref;
        receipt.status = STATUS_RECEIPT_ACCEPTED;

        event::emit(ReceiptAccepted {
            receipt_id: object::uid_to_address(&receipt.id),
            accepted_by: acceptor,
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // Public Accessors (for friend modules)
    // ══════════════════════════════════════════════════════════════════

    /// 获取 Lease 状态（供 escrow 模块验证）
    public(friend) fun lease_status(lease: &Lease): u8 {
        lease.status
    }

    /// 获取 Lease 的 lessee 地址
    public(friend) fun lease_lessee(lease: &Lease): address {
        lease.lessee
    }

    /// 获取 Lease 的 lessor 地址
    public(friend) fun lease_lessor(lease: &Lease): address {
        lease.lessor
    }

    /// 获取 Lease 的 escrow_id
    public(friend) fun lease_escrow_id(lease: &Lease): address {
        lease.escrow_id
    }

    /// 获取 Receipt 状态
    public(friend) fun receipt_status(receipt: &Receipt): u8 {
        receipt.status
    }
}

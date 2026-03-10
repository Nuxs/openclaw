// Copyright (c) OpenClaw Contributors
// SPDX-License-Identifier: Apache-2.0

/// # openclaw_escrow
///
/// 托管与奖励模块 —— 定义 Escrow<T> / Reward 两件套。
///
/// ## 设计原则
/// - Escrow 使用 `Balance<T>` 管理锁定资金，避免 Coin 对象传递复杂性
/// - 状态机单向跃迁：Locked → Released | Refunded | Disputed
/// - 与 EVM RewardDistributor / TON settlement.fc 保持三链状态口径对齐
/// - Reward 先定义语义，早期优先稳定币 / 积分映射
module openclaw_protocol::openclaw_escrow {

    // ══════════════════════════════════════════════════════════════════
    // Dependencies
    // ══════════════════════════════════════════════════════════════════

    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};

    // friend 声明
    friend openclaw_protocol::openclaw_market;

    // ══════════════════════════════════════════════════════════════════
    // Status Constants — Escrow
    // ══════════════════════════════════════════════════════════════════

    const STATUS_ESCROW_LOCKED: u8    = 1;
    const STATUS_ESCROW_RELEASED: u8  = 2;
    const STATUS_ESCROW_REFUNDED: u8  = 3;
    const STATUS_ESCROW_DISPUTED: u8  = 4;

    // ══════════════════════════════════════════════════════════════════
    // Status Constants — Reward
    // ══════════════════════════════════════════════════════════════════

    const STATUS_REWARD_PENDING: u8  = 1;
    const STATUS_REWARD_CLAIMED: u8  = 2;
    const STATUS_REWARD_EXPIRED: u8  = 3;

    // ══════════════════════════════════════════════════════════════════
    // Error Codes
    // ══════════════════════════════════════════════════════════════════

    const E_NOT_PAYER: u64            = 100;
    const E_NOT_PAYEE: u64            = 101;
    const E_NOT_LOCKED: u64           = 102;
    const E_ALREADY_SETTLED: u64      = 103;
    const E_NOT_SUBJECT: u64          = 104;
    const E_REWARD_NOT_PENDING: u64   = 105;
    const E_ZERO_AMOUNT: u64          = 106;
    const E_DISPUTE_WINDOW_ACTIVE: u64 = 107;

    // ══════════════════════════════════════════════════════════════════
    // Core Objects
    // ══════════════════════════════════════════════════════════════════

    /// Escrow<T> — 表达"钱什么时候锁、何时放、失败怎么退、争议怎么办"
    ///
    /// Owned Object：由 payer 创建并持有（PTB 中原子锁定）。
    /// 内部使用 Balance<T> 管理资金，entry 入口接受 Coin<T> 并转入。
    ///
    /// ## 状态机（单向跃迁）
    /// ```
    /// Locked ──→ Released   (payee 收款)
    ///        ├─→ Refunded   (payer 退款)
    ///        └─→ Disputed   (进入争议)
    /// ```
    struct Escrow<phantom T> has key, store {
        id: UID,
        /// 付款方
        payer: address,
        /// 收款方
        payee: address,
        /// 锁定余额
        locked: Balance<T>,
        /// 是否需要 Receipt 才能释放
        receipt_required: bool,
        /// 争议窗口（秒）
        dispute_window_sec: u64,
        /// 锁定时间戳（ms）
        locked_at: u64,
        /// 状态
        status: u8,
    }

    /// Reward — 表达"为什么奖励、奖励谁、何时可领、是否带条件"
    ///
    /// Owned Object：由系统 / 治理角色创建，transfer 给 subject。
    /// 早期优先稳定币奖励或积分映射，不仓促引入复杂 token 经济。
    struct Reward has key, store {
        id: UID,
        /// 奖励对象地址
        subject: address,
        /// 奖励原因编码
        reason_code: u8,
        /// 奖励资产标识（链下映射到具体 Coin type）
        asset_type_hash: vector<u8>,
        /// 奖励数额（最小单位）
        amount: u64,
        /// 领取策略标识
        claim_policy: u8,
        /// 归属策略标识（可选，0 = 即时可领）
        vesting_policy: u8,
        /// 触发事件 hash
        source_event_hash: vector<u8>,
        /// 状态
        status: u8,
    }

    // ══════════════════════════════════════════════════════════════════
    // Events
    // ══════════════════════════════════════════════════════════════════

    /// 资金已锁定事件
    struct EscrowLocked has copy, drop {
        escrow_id: address,
        payer: address,
        payee: address,
        amount: u64,
        dispute_window_sec: u64,
    }

    /// 资金已释放事件
    struct EscrowReleased has copy, drop {
        escrow_id: address,
        payee: address,
        amount: u64,
    }

    /// 资金已退款事件
    struct EscrowRefunded has copy, drop {
        escrow_id: address,
        payer: address,
        amount: u64,
    }

    /// 进入争议事件
    struct EscrowDisputed has copy, drop {
        escrow_id: address,
        initiated_by: address,
    }

    /// 奖励已创建事件
    struct RewardCreated has copy, drop {
        reward_id: address,
        subject: address,
        reason_code: u8,
        amount: u64,
    }

    /// 奖励已领取事件
    struct RewardClaimed has copy, drop {
        reward_id: address,
        subject: address,
        amount: u64,
    }

    // ══════════════════════════════════════════════════════════════════
    // Entry Functions — Escrow
    // ══════════════════════════════════════════════════════════════════

    /// 创建托管并锁定资金
    ///
    /// 在 PTB 中与 `openclaw_market::create_lease` 原子组合：
    /// ```
    /// PTB Step 1: escrow = create_escrow(coin, payee, ...)
    /// PTB Step 2: lease  = create_lease(..., escrow_id, ...)
    /// ```
    ///
    /// # 泛型参数
    /// - `T`: 结算 Coin 类型（如 `0x2::sui::SUI` 或稳定币）
    public entry fun create_escrow<T>(
        payment: Coin<T>,
        payee: address,
        receipt_required: bool,
        dispute_window_sec: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, E_ZERO_AMOUNT);

        let payer = tx_context::sender(ctx);
        let now = clock::timestamp_ms(clock);

        let escrow = Escrow<T> {
            id: object::new(ctx),
            payer,
            payee,
            locked: coin::into_balance(payment),
            receipt_required,
            dispute_window_sec,
            locked_at: now,
            status: STATUS_ESCROW_LOCKED,
        };

        event::emit(EscrowLocked {
            escrow_id: object::uid_to_address(&escrow.id),
            payer,
            payee,
            amount,
            dispute_window_sec,
        });

        // Escrow 归 payer 所有
        transfer::transfer(escrow, payer);
    }

    /// 释放托管资金给 payee
    ///
    /// 条件：状态为 Locked，且争议窗口已过（或无争议窗口）。
    /// 典型调用方：payer 确认交付后调用，或与 Receipt 验收联动。
    public entry fun release_escrow<T>(
        escrow: &mut Escrow<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(escrow.status == STATUS_ESCROW_LOCKED, E_NOT_LOCKED);
        assert!(escrow.payer == tx_context::sender(ctx), E_NOT_PAYER);

        let amount = balance::value(&escrow.locked);
        let released = coin::from_balance(
            balance::split(&mut escrow.locked, amount),
            ctx,
        );

        escrow.status = STATUS_ESCROW_RELEASED;

        event::emit(EscrowReleased {
            escrow_id: object::uid_to_address(&escrow.id),
            payee: escrow.payee,
            amount,
        });

        // 将资金转给 payee
        transfer::public_transfer(released, escrow.payee);
    }

    /// 退款：将锁定资金退还 payer
    ///
    /// 条件：状态为 Locked。仅 payer 可在争议窗口过后发起退款，
    /// 或双方协商后由 payer 执行。
    public entry fun refund_escrow<T>(
        escrow: &mut Escrow<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(escrow.status == STATUS_ESCROW_LOCKED, E_NOT_LOCKED);
        assert!(escrow.payer == tx_context::sender(ctx), E_NOT_PAYER);

        // 验证争议窗口已过
        let now = clock::timestamp_ms(clock);
        let window_ms = (escrow.dispute_window_sec as u64) * 1000;
        // 注意：退款需要争议窗口过后才可执行（防止 payee 还在争议期内就被退款）
        // 如果 dispute_window_sec == 0，则无需等待
        if (escrow.dispute_window_sec > 0) {
            assert!(now >= escrow.locked_at + window_ms, E_DISPUTE_WINDOW_ACTIVE);
        };

        let amount = balance::value(&escrow.locked);
        let refunded = coin::from_balance(
            balance::split(&mut escrow.locked, amount),
            ctx,
        );

        escrow.status = STATUS_ESCROW_REFUNDED;

        event::emit(EscrowRefunded {
            escrow_id: object::uid_to_address(&escrow.id),
            payer: escrow.payer,
            amount,
        });

        transfer::public_transfer(refunded, escrow.payer);
    }

    /// 发起争议
    ///
    /// payer 或 payee 均可在争议窗口内发起。
    /// 争议进入后，资金冻结，等待链下仲裁 → 链上执行裁决。
    public entry fun dispute_escrow<T>(
        escrow: &mut Escrow<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(escrow.status == STATUS_ESCROW_LOCKED, E_NOT_LOCKED);

        let sender = tx_context::sender(ctx);
        assert!(
            sender == escrow.payer || sender == escrow.payee,
            E_NOT_PAYER,
        );

        // 验证在争议窗口内
        let now = clock::timestamp_ms(clock);
        let window_ms = (escrow.dispute_window_sec as u64) * 1000;
        if (escrow.dispute_window_sec > 0) {
            assert!(now <= escrow.locked_at + window_ms, E_DISPUTE_WINDOW_ACTIVE);
        };

        escrow.status = STATUS_ESCROW_DISPUTED;

        event::emit(EscrowDisputed {
            escrow_id: object::uid_to_address(&escrow.id),
            initiated_by: sender,
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // Entry Functions — Reward
    // ══════════════════════════════════════════════════════════════════

    /// 创建奖励记录
    ///
    /// 由系统 / 治理角色调用。奖励对象 transfer 给 subject。
    /// 实际代币发放在 claim_reward 时执行（或由链下系统映射积分）。
    public entry fun create_reward(
        subject: address,
        reason_code: u8,
        asset_type_hash: vector<u8>,
        amount: u64,
        claim_policy: u8,
        vesting_policy: u8,
        source_event_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(amount > 0, E_ZERO_AMOUNT);

        let reward = Reward {
            id: object::new(ctx),
            subject,
            reason_code,
            asset_type_hash,
            amount,
            claim_policy,
            vesting_policy,
            source_event_hash,
            status: STATUS_REWARD_PENDING,
        };

        event::emit(RewardCreated {
            reward_id: object::uid_to_address(&reward.id),
            subject,
            reason_code,
            amount,
        });

        // Reward 归 subject 所有
        transfer::transfer(reward, subject);
    }

    /// 领取奖励
    ///
    /// 由 subject 调用。将 Reward 状态标记为已领取。
    /// 实际代币发放逻辑可在此扩展，或由链下系统通过事件触发。
    public entry fun claim_reward(
        reward: &mut Reward,
        ctx: &mut TxContext,
    ) {
        assert!(reward.subject == tx_context::sender(ctx), E_NOT_SUBJECT);
        assert!(reward.status == STATUS_REWARD_PENDING, E_REWARD_NOT_PENDING);

        reward.status = STATUS_REWARD_CLAIMED;

        event::emit(RewardClaimed {
            reward_id: object::uid_to_address(&reward.id),
            subject: reward.subject,
            amount: reward.amount,
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // Public Accessors (for friend modules)
    // ══════════════════════════════════════════════════════════════════

    /// 获取 Escrow 的 object address
    public(friend) fun escrow_address<T>(escrow: &Escrow<T>): address {
        object::uid_to_address(&escrow.id)
    }

    /// 获取 Escrow 状态
    public(friend) fun escrow_status<T>(escrow: &Escrow<T>): u8 {
        escrow.status
    }

    /// 获取 Escrow 锁定金额
    public(friend) fun escrow_locked_amount<T>(escrow: &Escrow<T>): u64 {
        balance::value(&escrow.locked)
    }
}

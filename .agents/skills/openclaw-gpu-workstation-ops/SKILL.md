---
name: openclaw-gpu-workstation-ops
description: Set up and maintain OpenClaw GPU workstations for local AI operations. Use when installing or operating Ubuntu on multi-GPU hosts, especially ASUS Z9PE-D8 WS, Tesla P40, CUDA, NVIDIA drivers, BIOS CSM/UEFI, SATA detection, SSH access, power management, proxy setup, Python environment management, and model-serving maintenance.
---

# OpenClaw GPU Workstation Ops

用于创建和维护 OpenClaw 本地 GPU 运维主机，覆盖 Ubuntu、多 GPU、CUDA、远程访问、代理、Python 环境、模型服务和长期稳定运行。

## 运维原则

- 老工作站/服务器主板优先稳定，不追求理论上最现代的启动方式。
- 未确认型号、容量和用途前，默认保护所有存储盘。
- 老 PCIe 亮机卡未证明 BIOS 阶段稳定显示前，不强制纯 UEFI。
- AI 主机禁用睡眠/休眠，按服务器方式常开或正常关机。
- 每一层都用运行证据验证：BIOS、磁盘识别、系统、NVIDIA 驱动、PCIe 链路、远程访问、代理、Python 环境。
- 系统 Python 保持干净；AI 环境用 conda/mamba，普通项目用 uv，全局 CLI 用 pipx。
- Linux 工具链优先使用 HTTP 代理；SOCKS 代理只作为上游或浏览器/curl 专用。代理实现可替换，但本机接口必须稳定。

## 稳定基线

ASUS `Z9PE-D8 WS` + `2 x Tesla P40` + 老亮机卡：

- 默认使用 Ubuntu `22.04 LTS`。
- `Above 4G Decoding` 开启，`ASPM` 关闭。
- P40 槽位关闭 Option ROM，亮机卡槽位开启 Option ROM。
- 亮机卡纯 UEFI 下 BIOS 阶段不显示时，使用 CSM/Legacy video。
- 系统 SSD 优先接 Intel C602 SATA 口，不优先接 Marvell 口。
- NVIDIA 驱动使用 Ubuntu 仓库中的 `nvidia-driver-550-server` 或更新 server/datacenter 分支。
- 代理标准接口为本机 `SOCKS5 127.0.0.1:1080` 加 `HTTP 127.0.0.1:8118`。默认可用实现为 Docker SSR + `privoxy`；Docker 镜像不可拉取时用本机 `legacy-py2` SSR 兜底。

## Python 环境维护标准

分层规则：

- 系统 Python 只给 Ubuntu 和 `apt` 使用，不用 `sudo pip install`。
- `base` 只放 conda/mamba 管理工具，不跑项目。
- AI、CUDA、PyTorch、训练和 SD 环境用 Miniforge + `mamba`。
- 普通 Python 项目和脚本用 `uv` 创建项目级 `.venv`。
- 全局 Python CLI 工具用 `pipx` 安装。
- Docker 只用于隔离复杂服务，不作为日常 Python 主方案。

标准环境命名：

- `openclaw`：OpenClaw / Node / Python 辅助工具。
- `llm`：llama.cpp、Transformers、Ollama 辅助推理环境。
- `train`：LLaMA-Factory、Axolotl、LoRA/QLoRA 微调环境。
- `sd`：Stable Diffusion WebUI 环境。
- `legacy-py2`：SSR 等历史 Python 2 工具。

P40 默认兼容组合：

- Python `3.10`。
- PyTorch `cu118` 优先。
- CUDA Toolkit 不默认安装；只有编译扩展或项目明确要求时再装。

## 新环境流程

1. **BIOS 检查**
   - 用最小硬件确认机器可以进入 BIOS。
   - 存储模式设为 `AHCI`。
   - 设置 `Above 4G Decoding = Enabled`。
   - 设置 `ASPM = Disabled`。
   - 如果亮机卡在 BIOS/GRUB 阶段无画面，使用 `CSM = Enabled/Auto`。
   - 除非明确需要网络启动，否则关闭 PXE。

2. **存储安全**
   - 通过容量、型号和用途识别系统 SSD 与数据盘。
   - 如果要保留数据，安装系统时物理断开数据盘。
   - 如果 Ubuntu Live 只看到 U 盘，安装前先检查 SATA 口组、AHCI 模式、线缆和 BIOS 磁盘识别。

3. **Ubuntu 安装**
   - 除非运维明确需要 LVM/ZFS/加密，否则系统盘使用普通 ext4 安装。
   - 安装器阶段的第三方驱动检测如果卡住，不要依赖它；首次启动后再安装 NVIDIA 驱动。

4. **安装后驱动验证**
   - 运行 `nvidia-smi`，要求两张 P40 都出现。
   - 用 `nvidia-smi topo -m` 检查拓扑。
   - 用 `lspci` 检查每张 P40 的链路宽度和速度；`Width x16` 是主要槽位目标。待机 `Speed 2.5GT/s` 可接受，负载升速即可。

5. **远程运维**
   - 安装并启用 SSH。
   - 尽量在路由器 DHCP 中固定主机 IP。
   - 长任务使用 `tmux`。

6. **电源策略**
   - 禁用 sleep、suspend、hibernate、hybrid sleep。
   - 禁用 GNOME 接交流电时自动睡眠。
   - 整机真实待机功耗以插座功率计为准。

7. **代理基线**
   - 对外固定 `127.0.0.1:1080` SOCKS5 和 `127.0.0.1:8118` HTTP 两个接口。
   - Docker SSR 镜像已存在时，优先用 Docker SSR；镜像不可拉取或 Docker Hub 不可达时，用本机 `legacy-py2` SSR 引导。
   - 使用 `privoxy` 把 SOCKS5 转成 HTTP。
   - 必要时给 Docker daemon、conda、pip、git 配置 HTTP 代理。

8. **Python 环境基线**
   - 不污染系统 Python。
   - 先确认系统 Python 和 `python3-venv`、`python3-pip` 可由 `apt` 管理。
   - 安装 Miniforge，并在 `base` 安装 `mamba`。
   - 为 `openclaw`、`llm`、`train`、`sd`、`legacy-py2` 创建独立环境。
   - 用 PyTorch `cu118` 验证 P40 CUDA 可见性。

## 上线验收（10 分钟）

新机或大改后，按顺序完成下面验收，再进入业务部署：

1. **硬件与驱动**
   - `nvidia-smi` 能看到 2 张 P40。
   - `nvidia-smi topo -m` 输出正常。
   - `lspci` 检查 P40 至少 `Width x16`。
2. **网络与远程**
   - `hostname -I` 已固定局域网地址（或 DHCP 预留）。
   - `systemctl status ssh` 为 `active (running)`。
3. **电源策略**
   - `sleep/suspend/hibernate/hybrid-sleep` 均为 `masked`。
4. **代理链路**
   - `ssr-local`（或替代实现）`active (running)`。
   - `privoxy` `active (running)`。
   - `curl --socks5-hostname 127.0.0.1:1080 https://www.google.com` 可通。
   - `curl -x http://127.0.0.1:8118 https://www.google.com` 可通。
5. **Python 环境**
   - `conda env list` 包含 `llm/train/sd`。
   - `llm` 环境中 `torch.cuda.is_available()` 为 `True`，设备数为 2。

## 故障分层排查顺序

出现故障时，严格按层排查，避免来回试错：

1. **硬件层**
   - POST 码、是否能进 BIOS、磁盘是否在 BIOS 可见、GPU 供电与温度。
2. **内核/驱动层**
   - `dmesg`、`lspci`、`nvidia-smi`、`systemctl status`。
3. **服务层**
   - `ssr-local`、`privoxy`、`docker`、`ssh` 是否 `active`。
4. **网络层**
   - 先测本机回环（127.0.0.1），再测外网目标，不直接上应用层。
5. **应用层**
   - conda/pip/git/docker pull 等工具链验证。

规则：上层失败不先改下层；先恢复到最近一次“已验证可用”的状态，再增量变更。

## 维护检查

固件变更、GPU 重插、驱动变更、代理异常或不明稳定性问题后运行：

- `nvidia-smi`
- `nvidia-smi topo -m`
- `lspci | grep -i nvidia`
- `sudo lspci -vv -s <bus-id> | grep -E "LnkCap|LnkSta"`
- `hostname -I`
- `systemctl status ssh`
- `systemctl status sleep.target suspend.target hibernate.target hybrid-sleep.target`
- `curl -x http://127.0.0.1:8118 https://github.com`
- `conda env list`
- `conda config --show proxy_servers`

## 变更与回滚纪律

- 单次只改一类配置（BIOS、驱动、代理、Python 环境），每次改完立刻验证。
- 所有关键配置文件改前备份，改后记录变更时间和原因。
- 代理相关优先保持接口稳定：`127.0.0.1:1080` 与 `127.0.0.1:8118` 不随实现变化。
- 驱动与 CUDA 不做“追新”升级，除非有明确需求或已验证兼容性。
- 出现连续失败（例如服务 auto-restart）先止血：停服务、读日志、最小改动修复。

## 决策规则

- BIOS 阶段无显示但 Ubuntu 加载后有显示时，优先怀疑亮机卡缺少或不兼容 UEFI GOP；使用 CSM/Legacy video 或更换亮机卡。
- Ubuntu Live 能启动但看不到 SSD/HDD 时，不要先假设是分区格式问题；先查 SATA 控制器模式、接口组和 BIOS 磁盘识别。
- CMOS 重置后卡 PCIe 相关 POST 码时，先拔 P40，只留亮机卡进 BIOS，恢复 Above 4G 和 P40 Option ROM 设置，再逐张加回 GPU。
- 睡眠/唤醒失败时，不要长期调参；禁用睡眠/休眠，按服务器运行。
- Docker 拉镜像失败时，先验证 HTTP 代理，不要先怀疑 Dockerfile。
- `ssr-local.service` 处于 `activating (auto-restart)` 时，不算正常；先看 `journalctl -u ssr-local -n 100 --no-pager` 和 `/etc/shadowsocksr/config.json`。
- Conda/pip 安装失败时，先确认代理和源，再判断包依赖。
- 禁止使用 `sudo pip install` 污染系统 Python。

## 参考

命令片段和详细检查表见 [reference.md](reference.md)。

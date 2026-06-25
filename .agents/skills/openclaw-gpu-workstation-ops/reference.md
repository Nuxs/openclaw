# OpenClaw GPU Workstation Ops Reference

This reference captures the stable setup and maintenance runbook for OpenClaw local GPU workstations.

## BIOS Baseline: ASUS Z9PE-D8 WS + P40

Recommended for old display card plus `2 x Tesla P40`:

```text
Above 4G Decoding              Enabled
ASPM Support                   Disabled
PCIe Link Speed                Auto first, Gen3 only if needed
NUMA                           Enabled
SATA Mode                      AHCI
Secure Boot                    Disabled / Not Active
PXE / Intel Boot Agent         Disabled / last priority
P40 slot Option ROM            Disabled
Display card slot Option ROM   Enabled
```

If old display card does not show BIOS in pure UEFI:

```text
Launch CSM                     Always / Enabled / Auto
Boot option filter             UEFI and Legacy, if available
Launch Video OpROM policy      Legacy only
Other PCI device ROM priority  Legacy OpROM
```

For a known UEFI-GOP display card:

```text
Launch CSM                     Never
Other PCI device ROM priority  UEFI OpROM
Secure Boot                    Disabled unless explicitly needed
```

## SATA Port Guidance

Use Intel C602 SATA for the OS disk.

Preferred:

```text
Intel C602 SATA 6Gb/s          SATA6G_1 / SATA6G_2
Intel C602 SATA 3Gb/s          acceptable for data disks
```

Avoid for OS install unless necessary:

```text
Marvell 9230 SATA 6Gb/s        SATA6G_E1/E2/E3/E4
SCU ports                      unless intentionally configured
```

If Ubuntu Live sees only the USB stick:

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL
sudo fdisk -l
lspci | grep -i -E "sata|ahci|raid|marvell|storage"
dmesg | grep -i -E "sata|ahci|ata|marvell|scsi|error"
```

Expected: internal disks appear as `/dev/sdX` even if partitions are Windows/NTFS or damaged.

## Ubuntu Install Defaults

Preferred:

```text
Ubuntu                         22.04 LTS
Filesystem                     ext4
Advanced features              None
Installer driver setup         optional; skip if it hangs
Data disks                     physically disconnect if data must be preserved
```

Post-install update:

```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

## NVIDIA Driver Setup

Install server/datacenter driver:

```bash
sudo apt update
sudo apt install -y nvidia-driver-550-server
sudo reboot
```

If a newer server driver is available and required:

```bash
apt search nvidia-driver | grep server
sudo apt install -y nvidia-driver-570-server
sudo reboot
```

Validate:

```bash
nvidia-smi
nvidia-smi topo -m
lspci | grep -i nvidia
```

Check PCIe links:

```bash
sudo lspci -vv -s 03:00.0 | grep -E "LnkCap|LnkSta"
sudo lspci -vv -s 04:00.0 | grep -E "LnkCap|LnkSta"
```

Interpretation:

```text
LnkCap Speed 8GT/s, Width x16     slot capability is PCIe 3.0 x16
LnkSta Width x16                  lane width is correct
LnkSta Speed 2.5GT/s              normal at idle if load raises speed
LnkSta Speed 8GT/s                full PCIe 3.0 speed under load
```

## Remote Access

Enable SSH:

```bash
sudo apt install -y openssh-server tmux
sudo systemctl enable --now ssh
hostname -I
systemctl status ssh
```

Connect from macOS or Windows:

```bash
ssh <user>@<lan-ip>
```

Use `tmux` for long jobs:

```bash
tmux new -s ai
# Ctrl+b, then d to detach
tmux attach -t ai
```

## Disable Sleep and Hibernate

Disable system sleep targets:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

Disable GNOME AC auto-sleep:

```bash
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
```

Optional for always-on remote desktop behavior:

```bash
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
```

Verify:

```bash
systemctl status sleep.target suspend.target hibernate.target hybrid-sleep.target
```

Expected:

```text
Loaded: masked
Active: inactive (dead)
```

Restore if needed:

```bash
sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'suspend'
```

## Power and Temperature Checks

GPU power:

```bash
watch -n 1 'nvidia-smi --query-gpu=index,name,power.draw,temperature.gpu,utilization.gpu --format=csv'
```

CPU/package power:

```bash
sudo apt install -y linux-tools-common linux-tools-generic powertop lm-sensors
sudo apt install -y linux-tools-$(uname -r) || true
sudo turbostat --Summary --interval 1
```

Temperature sensors:

```bash
sudo sensors-detect
sensors
watch -n 1 sensors
```

Use a wall power meter for true whole-system idle power.

## Model Ops Defaults

Prefer stable P40-friendly serving:

```text
llama.cpp server
Ollama
text-generation-webui
LLaMA-Factory for LoRA/QLoRA
```

Avoid making modern vLLM the default on Tesla P40. P40 is Pascal `sm_61`; current vLLM/Triton support is not a reliable baseline for OpenClaw operations.

## 代理标准方案

### 核心模型

OpenClaw Ubuntu 运维主机固定本机代理接口，代理后端可以替换。当前标准实现是 Docker SSR + `privoxy`；当 Docker Hub 不可达、基础镜像未准备好时，用本机 `legacy-py2` SSR 作为引导兜底。

推荐结构：

```text
SSR/兼容客户端       127.0.0.1:1080  SOCKS5
privoxy             127.0.0.1:8118  HTTP
apt/docker/conda    http://127.0.0.1:8118
pip/git/curl        http://127.0.0.1:8118
```

原则：

```text
SOCKS 给浏览器、curl 或作为上游
HTTP 给 Linux 工具链
```

维护原则：

```text
接口固定：127.0.0.1:1080 + 127.0.0.1:8118
实现可换：Docker SSR / native SSR / mihomo / sing-box
工具只依赖 HTTP：Docker、conda、pip、git 不直接依赖 SOCKS
```

如果 `python:2.7-slim` 已经成功拉取并构建出 `ssr-local-client` 镜像，Docker SSR 是可接受的标准实现。新机器初始化时如果 Docker Hub 不通，再切到 native `legacy-py2` 兜底。

### Docker SSR 标准实现

前提：

```text
/opt/ssr-client/shadowsocksr       SSR 代码
/opt/ssr-client/Dockerfile         Dockerfile
/etc/shadowsocksr/config.json      SSR 参数
ssr-local-client:latest            已构建镜像
```

创建 systemd 服务：

```bash
sudo tee /etc/systemd/system/ssr-local.service >/dev/null <<'EOF'
[Unit]
Description=ShadowsocksR Local Client (Docker)
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Restart=always
RestartSec=3
ExecStartPre=-/usr/bin/docker rm -f ssr-local
ExecStart=/usr/bin/docker run --rm --network host --name ssr-local -v /etc/shadowsocksr:/config:ro ssr-local-client
ExecStop=/usr/bin/docker stop ssr-local

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ssr-local
```

验证：

```bash
systemctl status ssr-local
curl --socks5-hostname 127.0.0.1:1080 https://github.com
```

`ExecStartPre` 中的 `No such container: ssr-local` 可忽略，它只是清理旧容器。  
但如果状态是 `activating (auto-restart)` 或 `Result: exit-code`，不算正常，必须查日志：

```bash
journalctl -u ssr-local -n 100 --no-pager
sudo docker ps -a | grep ssr-local || true
sudo docker run --rm --network host -v /etc/shadowsocksr:/config:ro ssr-local-client
```

常见原因：

```text
/etc/shadowsocksr/config.json 不存在或 JSON 格式错误
SSR 参数和服务器不匹配
127.0.0.1:1080 已被其他进程占用
Docker 被重启后服务尚未恢复
```

### SOCKS 转 HTTP

安装 `privoxy`：

```bash
sudo apt update
sudo apt install -y privoxy
```

在 `/etc/privoxy/config` 末尾加入：

```text
listen-address  127.0.0.1:8118
forward-socks5t / 127.0.0.1:1080 .
```

重启并设为开机启动：

```bash
sudo systemctl restart privoxy
sudo systemctl enable privoxy
```

验证：

```bash
curl --socks5-hostname 127.0.0.1:1080 https://github.com
curl -x http://127.0.0.1:8118 https://github.com
```

如果 SOCKS 通但 HTTP 不通，查 `privoxy` 配置。  
如果 SOCKS 不通，查 SSR/上游代理配置。

### SSR 本机部署（兜底，不用 Docker）

当 Docker Hub 不可达、`python:2.7-slim` 拉不下来，或 Docker daemon 自身代理尚未建立时，用本机 `legacy-py2` 方案引导。镜像已经构建成功时，不必强行切换到 native 方案。

前提：`/opt/ssr-client/shadowsocksr` 已存在（Docker 脚本通常已 clone）。

1. 写入 `/etc/shadowsocksr/config.json`（参数与 Windows SSR 客户端一致）。
2. 手动测试：

```bash
conda activate legacy-py2
python /opt/ssr-client/shadowsocksr/shadowsocks/local.py -c /etc/shadowsocksr/config.json
```

另开终端：

```bash
curl --socks5-hostname 127.0.0.1:1080 https://github.com
```

3. 创建 systemd（用户名、conda 路径按实际修改）：

```bash
sudo tee /etc/systemd/system/ssr-local.service >/dev/null <<'EOF'
[Unit]
Description=ShadowsocksR Local Client (native)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=neo
ExecStart=/home/neo/miniforge3/envs/legacy-py2/bin/python /opt/ssr-client/shadowsocksr/shadowsocks/local.py -c /etc/shadowsocksr/config.json
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ssr-local
systemctl status ssr-local
```

4. 安装并配置 `privoxy`（见上文 SOCKS 转 HTTP），然后 Docker 代理改为本机 HTTP：

```text
http://127.0.0.1:8118
```

不要长期依赖 Windows `192.168.1.35:1080` SOCKS。

5. Docker 版 SSR 镜像可保留作标准实现；native SSR 作为兜底方案。

### 临时终端代理

当前 shell 临时使用 HTTP 代理：

```bash
export HTTP_PROXY=http://127.0.0.1:8118
export HTTPS_PROXY=http://127.0.0.1:8118
export http_proxy=http://127.0.0.1:8118
export https_proxy=http://127.0.0.1:8118
```

当前 shell 临时使用 SOCKS：

```bash
export ALL_PROXY=socks5h://127.0.0.1:1080
```

### Docker 代理

Docker 拉镜像的是 daemon，不是当前 shell。必须配置 systemd drop-in：

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/proxy.conf >/dev/null <<'EOF'
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:8118"
Environment="HTTPS_PROXY=http://127.0.0.1:8118"
Environment="NO_PROXY=localhost,127.0.0.1,192.168.0.0/16,10.0.0.0/8"
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker
```

验证：

```bash
sudo docker pull hello-world
```

### Conda、pip、git 代理

Conda：

```bash
conda config --set proxy_servers.http http://127.0.0.1:8118
conda config --set proxy_servers.https http://127.0.0.1:8118
conda config --show proxy_servers
```

取消：

```bash
conda config --remove-key proxy_servers
```

pip 临时代理：

```bash
pip install <package> --proxy http://127.0.0.1:8118
```

git：

```bash
git config --global http.proxy http://127.0.0.1:8118
git config --global https.proxy http://127.0.0.1:8118
```

取消：

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```

### 借用 Windows 局域网代理

临时引导时可以借用 Windows 主力机代理，但不作为最终标准。

Windows 代理客户端必须：

```text
Allow LAN / 允许来自局域网的连接 = On
HTTP 端口优先，例如 7890
SOCKS 端口可选，例如 7891
```

Ubuntu 测试：

```bash
curl -x http://<windows-ip>:7890 https://github.com
curl --socks5-hostname <windows-ip>:7891 https://github.com
```

如果 `curl --socks5-hostname <windows-ip>:1080 ...` 报 `Connection to proxy closed`，说明 TCP 端口可达但 SOCKS 握手被代理端关闭。优先改用 HTTP 代理或更换支持 LAN HTTP 的客户端。

## Python 多环境管理标准

### 分层原则

```text
系统 Python        只给 Ubuntu 系统和 apt 管理，不手动污染
Miniforge/mamba    AI、CUDA、PyTorch、训练环境
uv                 普通 Python 项目和脚本环境
pipx               全局 Python CLI 工具
Docker             隔离复杂服务，不作为日常 Python 主方案
```

禁止：

```bash
sudo pip install ...
```

### 安装顺序

保持系统 Python 干净，只用 `apt` 管理 Ubuntu 需要的包：

```bash
python3 --version
sudo apt install -y python3 python3-venv python3-pip
```

不要用系统 Python 跑项目，也不要对系统 Python 做全局 `pip install`。

### 安装 Miniforge 和 mamba

```bash
cd ~
wget https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh
bash Miniforge3-Linux-x86_64.sh
source ~/miniforge3/bin/activate
conda install -n base -c conda-forge mamba -y
```

`base` 只放 conda/mamba 管理工具，不跑项目。

### 标准环境命名

```text
base          管理 conda/mamba
openclaw      OpenClaw 辅助环境
llm           推理和通用 Transformers 环境
train         LLaMA-Factory / Axolotl 微调环境
sd            Stable Diffusion WebUI 环境
legacy-py2    SSR 等历史 Python2 工具
```

### P40 兼容默认

Tesla P40 是 Pascal `sm_61`。默认 Python/CUDA 组合：

```text
Python         3.10
PyTorch        cu118 优先
CUDA Toolkit   非必须；需要编译时再装
```

创建 LLM 环境：

```bash
mamba create -n llm python=3.10 -y
conda activate llm
pip install --upgrade pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

验证：

```bash
python - <<'PY'
import torch
print(torch.cuda.is_available())
print(torch.cuda.device_count())
print(torch.cuda.get_device_name(0))
PY
```

创建微调环境：

```bash
mamba create -n train python=3.10 -y
conda activate train
pip install --upgrade pip
```

创建 SD 环境：

```bash
mamba create -n sd python=3.10 -y
conda activate sd
pip install --upgrade pip
```

历史 Python2 工具环境：

```bash
mamba create -n legacy-py2 python=2.7 -y
conda activate legacy-py2
python --version
```

### 环境操作

```bash
conda env list
conda activate <env>
conda deactivate
conda remove -n <env> --all
conda env export --from-history > environment.yml
mamba env create -f environment.yml
```

### uv 和 pipx

安装 `uv`：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

普通项目：

```bash
mkdir my-project
cd my-project
uv init
uv venv
source .venv/bin/activate
uv add requests
```

已有项目：

```bash
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

安装 `pipx`：

```bash
sudo apt install -y pipx
pipx ensurepath
```

安装全局 CLI：

```bash
pipx install ruff
pipx install black
```

这些 CLI 工具不进入系统 Python，也不进入 AI conda 环境。

### 目录标准

小盘：

```text
~/work
~/models
~/datasets
~/outputs
~/env-files
```

有数据盘：

```text
/data/work
/data/models
/data/datasets
/data/outputs
/data/env-files
```

最终标准：AI 用 Miniforge + `mamba`，普通项目用 `uv`，全局命令行工具用 `pipx`，系统 Python 不碰。

#!/usr/bin/env python3
"""
MachCtrl Backend - Lê sensores reais via lm_sensors e controla fans via fancontrol.
Serve dados em tempo real via WebSocket para o dashboard.

Requisitos: pip install websockets psutil
"""

import asyncio
import json
import subprocess
import re
import os
import time
from collections import deque
from datetime import datetime

try:
    import websockets
except ImportError:
    print("Instalando websockets...")
    os.system("pip install websockets")
    import websockets

try:
    import psutil
except ImportError:
    print("Instalando psutil...")
    os.system("pip install psutil")
    import psutil


# ==================== CONFIGURAÇÃO ====================

WEBSOCKET_HOST = "0.0.0.0"
WEBSOCKET_PORT = 8765
UPDATE_INTERVAL = 2  # segundos

HWMON_BASE = "/sys/class/hwmon"

# ==================== DETECÇÃO DE SENSORES ====================

def find_hwmon_devices():
    devices = {}
    if not os.path.exists(HWMON_BASE):
        return devices
    name_counts = {}
    for entry in sorted(os.listdir(HWMON_BASE)):
        path = os.path.join(HWMON_BASE, entry)
        name_file = os.path.join(path, "name")
        if os.path.exists(name_file):
            with open(name_file) as f:
                name = f.read().strip()
            # Se o nome já existe, usa nome+índice para evitar sobrescrever
            # Ex: dois chips "coretemp" viram "coretemp" e "coretemp_1"
            if name in name_counts:
                name_counts[name] += 1
                unique_name = f"{name}_{name_counts[name]}"
            else:
                name_counts[name] = 0
                unique_name = name
            devices[unique_name] = path
    return devices


def find_temp_sensors(hwmon_path):
    temps = {}
    for f in sorted(os.listdir(hwmon_path)):
        match = re.match(r"temp(\d+)_input", f)
        if match:
            idx = match.group(1)
            label_file = os.path.join(hwmon_path, f"temp{idx}_label")
            label = f"Temp {idx}"
            if os.path.exists(label_file):
                with open(label_file) as lf:
                    label = lf.read().strip()
            temps[label] = os.path.join(hwmon_path, f)
    return temps


def find_fan_sensors(hwmon_path):
    fans = {}
    for f in sorted(os.listdir(hwmon_path)):
        match = re.match(r"fan(\d+)_input", f)
        if match:
            idx = match.group(1)
            label_file = os.path.join(hwmon_path, f"fan{idx}_label")
            label = f"Fan {idx}"
            if os.path.exists(label_file):
                with open(label_file) as lf:
                    label = lf.read().strip()
            fans[label] = {
                "input": os.path.join(hwmon_path, f),
                "pwm": os.path.join(hwmon_path, f"pwm{idx}"),
                "pwm_enable": os.path.join(hwmon_path, f"pwm{idx}_enable"),
                "idx": idx,
            }
    return fans


def find_all_pwm():
    pwms = {}
    if not os.path.exists(HWMON_BASE):
        return pwms
    for entry in sorted(os.listdir(HWMON_BASE)):
        path = os.path.join(HWMON_BASE, entry)
        for f in sorted(os.listdir(path)):
            match = re.match(r"pwm(\d+)$", f)
            if match:
                idx = match.group(1)
                name_file = os.path.join(path, "name")
                chip_name = "unknown"
                if os.path.exists(name_file):
                    with open(name_file) as nf:
                        chip_name = nf.read().strip()
                fan_input = os.path.join(path, f"fan{idx}_input")
                pwm_path = os.path.join(path, f)
                pwm_enable = os.path.join(path, f"pwm{idx}_enable")
                key = f"{chip_name}_pwm{idx}"
                pwms[key] = {
                    "pwm": pwm_path,
                    "pwm_enable": pwm_enable if os.path.exists(pwm_enable) else None,
                    "fan_input": fan_input if os.path.exists(fan_input) else None,
                }
    return pwms


# ==================== LEITURA DE SENSORES ====================

def read_sensor_file(path):
    try:
        with open(path) as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError, PermissionError):
        return None


def get_cpu_topology():
    """Detecta todos os sockets físicos e seus núcleos via /proc/cpuinfo."""
    sockets = {}  # physical_id -> {"model": str, "cores": set(), "threads": [logical_ids]}
    try:
        with open("/proc/cpuinfo") as f:
            current = {}
            for line in f:
                line = line.strip()
                if not line:
                    if current:
                        pid = current.get("physical id", "0")
                        sockets.setdefault(pid, {"model": "", "cores": set(), "threads": []})
                        sockets[pid]["model"] = current.get("model name", sockets[pid]["model"])
                        if "core id" in current:
                            sockets[pid]["cores"].add(current["core id"])
                        if "processor" in current:
                            try:
                                sockets[pid]["threads"].append(int(current["processor"]))
                            except ValueError:
                                pass
                    current = {}
                    continue
                if ":" in line:
                    k, v = line.split(":", 1)
                    current[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return sockets


def get_cpu_info():
    """Informações agregadas + por socket."""
    topology = get_cpu_topology()
    freqs_per_cpu = []
    try:
        per = psutil.cpu_freq(percpu=True)
        if per:
            freqs_per_cpu = [round(f.current / 1000, 2) for f in per]
    except Exception:
        pass
    usage_per_cpu = psutil.cpu_percent(interval=None, percpu=True) or []

    info = {
        "usage": psutil.cpu_percent(interval=None),
        "freq": 0,
        "cores": psutil.cpu_count(logical=False) or 0,
        "threads": psutil.cpu_count(logical=True) or 0,
        "model": "Desconhecido",
        "sockets": [],
    }
    freq = psutil.cpu_freq()
    if freq:
        info["freq"] = round(freq.current / 1000, 2)

    # Constrói lista por socket
    for pid in sorted(topology.keys(), key=lambda x: int(x) if x.isdigit() else 0):
        s = topology[pid]
        threads = sorted(s["threads"])
        sock_freqs = [freqs_per_cpu[t] for t in threads if t < len(freqs_per_cpu)]
        sock_usages = [usage_per_cpu[t] for t in threads if t < len(usage_per_cpu)]
        # Per-thread usage indexed by logical CPU id (for core circles)
        thread_usages = {t: usage_per_cpu[t] for t in threads if t < len(usage_per_cpu)}
        thread_freqs = {t: freqs_per_cpu[t] for t in threads if t < len(freqs_per_cpu)}
        info["sockets"].append({
            "id": int(pid) if pid.isdigit() else 0,
            "model": s["model"] or info["model"],
            "core_count": len(s["cores"]),
            "thread_count": len(threads),
            "threads": threads,
            "thread_usages": thread_usages,
            "thread_freqs": thread_freqs,
            "freq": round(sum(sock_freqs) / len(sock_freqs), 2) if sock_freqs else 0,
            "usage": round(sum(sock_usages) / len(sock_usages), 1) if sock_usages else 0,
        })

    if info["sockets"]:
        info["model"] = info["sockets"][0]["model"]
    return info


def get_cpu_power():
    """Lê consumo real da CPU via RAPL (Running Average Power Limit) como GtkStressTesting."""
    # Tenta RAPL primeiro (Intel/AMD)
    rapl_base = "/sys/class/powercap"
    if os.path.exists(rapl_base):
        for entry in os.listdir(rapl_base):
            name_path = os.path.join(rapl_base, entry, "name")
            energy_path = os.path.join(rapl_base, entry, "energy_uj")
            if os.path.exists(name_path) and os.path.exists(energy_path):
                try:
                    with open(name_path) as f:
                        name = f.read().strip()
                    if name == "package-0":
                        return energy_path
                except (PermissionError, FileNotFoundError):
                    pass

    # Tenta hwmon power sensors
    if os.path.exists(HWMON_BASE):
        for entry in sorted(os.listdir(HWMON_BASE)):
            path = os.path.join(HWMON_BASE, entry)
            for f in sorted(os.listdir(path)):
                if re.match(r"power\d+_input", f):
                    return os.path.join(path, f)
    return None


def read_rapl_power(energy_path, prev_energy, prev_time):
    """Calcula watts a partir de leituras RAPL (energy_uj é acumulativo)."""
    try:
        with open(energy_path) as f:
            energy_uj = int(f.read().strip())
        now = time.time()
        if prev_energy is not None and prev_time is not None:
            dt = now - prev_time
            if dt > 0:
                watts = (energy_uj - prev_energy) / (dt * 1_000_000)
                if watts < 0:  # overflow do contador
                    watts = 0
                return round(watts, 1), energy_uj, now
        return 0, energy_uj, now
    except (PermissionError, FileNotFoundError, ValueError):
        return 0, None, None


def get_cpu_voltage():
    """Lê voltagem da CPU via hwmon (se disponível)."""
    if os.path.exists(HWMON_BASE):
        for entry in sorted(os.listdir(HWMON_BASE)):
            path = os.path.join(HWMON_BASE, entry)
            for f in sorted(os.listdir(path)):
                if re.match(r"in0_input", f):
                    val = read_sensor_file(os.path.join(path, f))
                    if val is not None:
                        v = val / 1000.0
                        if 0.5 < v < 2.0:  # range válido para Vcore
                            return round(v, 3)
    return 0


def _parse_dmidecode_blocks(output):
    """Parseia blocos de 'dmidecode -t 17' e retorna (slots, total, occupied)."""
    slots = []
    total = 0
    occupied = 0
    blocks = re.split(r"^Memory Device$", output, flags=re.MULTILINE)
    for block in blocks[1:]:
        if "Size:" not in block:
            continue
        total += 1
        size_line = re.search(r"Size:\s+(.+)", block)
        if not size_line:
            continue
        size_text = size_line.group(1).strip()
        if "No Module" in size_text or "Not Installed" in size_text or size_text == "0":
            continue
        size_match = re.match(r"(\d+)\s*(kB|KiB|MB|MiB|GB|GiB|TB|TiB)", size_text, re.IGNORECASE)
        if not size_match:
            continue
        occupied += 1
        size_val = int(size_match.group(1))
        size_unit = size_match.group(2).lower()
        if size_unit in ("kb", "kib"):
            size_gb = round(size_val / (1024 * 1024), 2)
        elif size_unit in ("mb", "mib"):
            size_gb = round(size_val / 1024, 1)
        elif size_unit in ("tb", "tib"):
            size_gb = size_val * 1024
        else:  # gb, gib
            size_gb = size_val
        speed_m  = re.search(r"^\s*Speed:\s+(\d+)\s*(MHz|MT/s)", block, re.MULTILINE)
        cspeed_m = re.search(r"Configured (?:Memory |Clock )?Speed:\s+(\d+)\s*(MHz|MT/s)", block)
        volt_m   = re.search(r"Configured Voltage:\s+([\d.]+)\s*V", block) or \
                   re.search(r"Minimum Voltage:\s+([\d.]+)\s*V", block)
        type_m   = re.search(r"^\s*Type:\s+(\S+)", block, re.MULTILINE)
        loc_m    = re.search(r"^\s*Locator:\s+(.+)", block, re.MULTILINE)
        bank_m   = re.search(r"Bank Locator:\s+(.+)", block)
        mfr_m    = re.search(r"Manufacturer:\s+(.+)", block)
        part_m   = re.search(r"Part Number:\s+(.+)", block)
        serial_m = re.search(r"Serial Number:\s+(.+)", block)
        rank_m   = re.search(r"Rank:\s+(\d+)", block)
        locator  = loc_m.group(1).strip() if loc_m else "?"
        bank     = bank_m.group(1).strip() if bank_m else ""
        mfr      = mfr_m.group(1).strip() if mfr_m else "?"
        if mfr in ("Unknown", "Not Specified", "Undefined", ""):
            mfr = "?"
        slots.append({
            "locator": locator, "bank": bank, "size_gb": size_gb,
            "type": type_m.group(1).strip() if type_m else "?",
            "speed_mhz": int(speed_m.group(1)) if speed_m else 0,
            "configured_speed_mhz": int(cspeed_m.group(1)) if cspeed_m else 0,
            "voltage": float(volt_m.group(1)) if volt_m else 0,
            "manufacturer": mfr,
            "part_number": part_m.group(1).strip() if part_m else "?",
            "serial": serial_m.group(1).strip() if serial_m else "",
            "rank": int(rank_m.group(1)) if rank_m else 0,
        })
    return slots, total, occupied


def get_memory_info():
    """Obtém uso de memória e informações dos slots — múltiplos métodos em cascata."""
    mem = psutil.virtual_memory()
    info = {
        "usage": round(mem.percent, 1),
        "total_gb": round(mem.total / (1024**3), 1),
        "used_gb": round(mem.used / (1024**3), 1),
        "slots": [],
        "total_slots": 0,
        "occupied_slots": 0,
    }

    # Método 1: dmidecode direto (funciona se rodando como root)
    dmidecode_output = None
    for cmd in [["dmidecode", "-t", "17"], ["sudo", "-n", "dmidecode", "-t", "17"]]:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=6)
            if r.returncode == 0 and "Memory Device" in r.stdout:
                dmidecode_output = r.stdout
                break
        except Exception:
            pass

    if dmidecode_output:
        slots, total, occupied = _parse_dmidecode_blocks(dmidecode_output)
        info["total_slots"] = total
        info["occupied_slots"] = occupied
        info["slots"] = slots

    # Método 2: heurística /proc/meminfo (último recurso se dmidecode falhou)
    if info["occupied_slots"] == 0:
        try:
            total_gb = info["total_gb"]
            # Tamanhos comuns de módulo: 4, 8, 16, 32, 64 GB
            for module_size in [64, 32, 16, 8, 4]:
                if total_gb % module_size < 0.5:
                    n_modules = round(total_gb / module_size)
                    if 1 <= n_modules <= 16:
                        for i in range(n_modules):
                            info["slots"].append({
                                "locator": f"DIMM {i+1}", "bank": "",
                                "size_gb": module_size, "type": "?",
                                "speed_mhz": 0, "configured_speed_mhz": 0,
                                "voltage": 0, "manufacturer": "?",
                                "part_number": "?", "serial": "", "rank": 0,
                            })
                        info["occupied_slots"] = n_modules
                        if info["total_slots"] == 0:
                            info["total_slots"] = n_modules
                        print(f"ℹ️  Memória: heurística {n_modules}x{module_size}GB")
                        break
        except Exception:
            pass

    return info


def get_gpu_name():
    """Detecta o nome da GPU via lspci."""
    try:
        r = subprocess.run(["lspci"], capture_output=True, text=True, timeout=4)
        for line in r.stdout.splitlines():
            lower = line.lower()
            if any(k in lower for k in ("vga", "3d controller", "display controller")):
                # Remove o endereço PCI e extrai o nome
                parts = line.split(":", 2)
                name = parts[-1].strip() if len(parts) >= 2 else line
                # Remove prefixos comuns
                for prefix in ("Advanced Micro Devices, Inc. [AMD/ATI]",
                               "NVIDIA Corporation", "Intel Corporation",
                               "Advanced Micro Devices, Inc."):
                    name = name.replace(prefix, "").strip()
                # Remove sufixo de revisão "(rev XX)"
                name = re.sub(r"\s*\(rev [0-9a-f]+\)\s*", "", name).strip()
                return name
    except Exception:
        pass
    # Fallback: nome do hwmon amdgpu/nouveau
    return ""


def get_system_info():
    """Obtém informações do sistema: hostname, kernel, OS, uptime, placa-mãe, GPU."""
    info = {"hostname": "", "kernel": "", "os": "", "uptime": "", "board": "Desconhecida", "gpu_name": ""}

    try:
        info["hostname"] = subprocess.run(["hostname"], capture_output=True, text=True).stdout.strip()
    except FileNotFoundError:
        pass
    try:
        info["kernel"] = subprocess.run(["uname", "-r"], capture_output=True, text=True).stdout.strip()
    except FileNotFoundError:
        pass
    try:
        with open("/etc/os-release") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    info["os"] = line.split("=")[1].strip().strip('"')
                    break
    except FileNotFoundError:
        info["os"] = "Linux"
    try:
        def _read(p):
            try:
                with open(p) as f:
                    return f.read().strip()
            except (FileNotFoundError, PermissionError):
                return ""

        board_vendor = _read("/sys/class/dmi/id/board_vendor")
        board_name = _read("/sys/class/dmi/id/board_name")
        board_version = _read("/sys/class/dmi/id/board_version")
        product_name = _read("/sys/class/dmi/id/product_name")
        sys_vendor = _read("/sys/class/dmi/id/sys_vendor")

        # Filtra strings genéricas
        def _clean(s):
            if not s:
                return ""
            generic = ("default string", "to be filled by o.e.m.", "system manufacturer",
                       "system product name", "not specified", "none", "n/a", "oem", "unknown")
            return "" if s.lower().strip() in generic else s.strip()

        board_vendor = _clean(board_vendor)
        board_name = _clean(board_name)
        product_name = _clean(product_name)
        sys_vendor = _clean(sys_vendor)
        board_version = _clean(board_version)

        # Monta melhor identificação possível
        parts = []
        vendor = board_vendor or sys_vendor
        name = board_name or product_name
        if vendor:
            parts.append(vendor)
        if name:
            parts.append(name)
        if board_version and board_version not in (name, vendor):
            parts.append(f"({board_version})")

        # Fallback dmidecode
        if not parts:
            try:
                r = subprocess.run(["dmidecode", "-s", "baseboard-product-name"],
                                   capture_output=True, text=True, timeout=3)
                n = _clean(r.stdout.strip())
                r2 = subprocess.run(["dmidecode", "-s", "baseboard-manufacturer"],
                                    capture_output=True, text=True, timeout=3)
                v = _clean(r2.stdout.strip())
                if v: parts.append(v)
                if n: parts.append(n)
            except Exception:
                pass

        info["board"] = " ".join(parts) if parts else "Desconhecida"
    except PermissionError:
        info["board"] = "Desconhecida (precisa de root)"

    # BIOS date
    try:
        def _read(p):
            try:
                with open(p) as f: return f.read().strip()
            except: return ""
        bios_date    = _read("/sys/class/dmi/id/bios_date")
        bios_vendor  = _read("/sys/class/dmi/id/bios_vendor")
        bios_version = _read("/sys/class/dmi/id/bios_version")
        info["bios_date"]    = bios_date
        info["bios_vendor"]  = bios_vendor
        info["bios_version"] = bios_version
    except Exception:
        info["bios_date"] = info["bios_vendor"] = info["bios_version"] = ""

    # Data de instalação do sistema (baseada em /lost+found ou /var/log/pacman.log)
    try:
        install_ts = None
        for path in ["/var/log/pacman.log", "/var/log/dpkg.log"]:
            if os.path.exists(path):
                with open(path) as f:
                    first = f.readline().strip()
                if first:
                    import re as _re
                    m = _re.match(r"\[(\d{4}-\d{2}-\d{2})", first)
                    if m:
                        info["install_date"] = m.group(1)
                        break
        if "install_date" not in info:
            # Fallback: data de criação do filesystem root
            st = os.stat("/")
            info["install_date"] = time.strftime("%Y-%m-%d", time.localtime(st.st_ctime))
    except Exception:
        info["install_date"] = ""

    # Total de armazenamento (todos os discos físicos, montados ou não)
    try:
        total_storage_gb = 0
        block_dir = "/sys/block"
        if os.path.exists(block_dir):
            for dev in os.listdir(block_dir):
                # Ignora partições, loops, ram
                if re.match(r"^(loop|ram|zram|sr|fd)", dev):
                    continue
                size_path = f"{block_dir}/{dev}/size"
                if os.path.exists(size_path):
                    try:
                        with open(size_path) as f:
                            sectors = int(f.read().strip())
                        total_storage_gb += sectors * 512 / (1024**3)
                    except Exception:
                        pass
        info["total_storage_gb"] = round(total_storage_gb, 1)
    except Exception:
        info["total_storage_gb"] = 0

    # Bateria
    try:
        battery = psutil.sensors_battery()
        if battery:
            info["battery"] = {
                "percent":   round(battery.percent, 1),
                "plugged":   battery.power_plugged,
                "secsleft":  battery.secsleft if battery.secsleft > 0 else 0,
            }
    except Exception:
        pass

    # Wallpaper atual
    try:
        wall = ""
        # KDE Plasma
        r = subprocess.run(
            ["qdbus", "org.kde.plasmashell", "/PlasmaShell",
             "org.kde.PlasmaShell.evaluateScript",
             "var all=desktops();var d=all[0];d.currentConfigGroup=['Wallpaper','org.kde.image','General'];d.readConfig('Image')"],
            capture_output=True, text=True, timeout=3
        )
        if r.returncode == 0 and r.stdout.strip():
            wall = r.stdout.strip().replace("file://", "")
        # GNOME fallback
        if not wall:
            r2 = subprocess.run(
                ["gsettings", "get", "org.gnome.desktop.background", "picture-uri"],
                capture_output=True, text=True, timeout=2
            )
            if r2.returncode == 0:
                wall = r2.stdout.strip().strip("'\"").replace("file://", "")
        info["wallpaper"] = wall
    except Exception:
        info["wallpaper"] = ""

    # GPU
    info["gpu_name"] = get_gpu_name()

    try:
        uptime_seconds = time.time() - psutil.boot_time()
        hours = int(uptime_seconds // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        info["uptime"] = f"{hours}h {minutes:02d}m"
    except Exception:
        info["uptime"] = "N/A"
    return info


def get_top_processes(n=10):
    """Retorna os N processos com maior uso de RAM."""
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'memory_info', 'cpu_percent']):
        try:
            mem = p.info['memory_info'].rss if p.info['memory_info'] else 0
            procs.append({
                "pid":    p.info['pid'],
                "name":   p.info['name'],
                "mem_mb": round(mem / (1024**2), 1),
                "cpu":    round(p.info['cpu_percent'] or 0, 1),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    procs.sort(key=lambda x: x['mem_mb'], reverse=True)
    return procs[:n]


def get_disk_type(device: str) -> str:
    """Detecta o tipo de disco: nvme, ssd ou hdd."""
    dev = device.replace("/dev/", "").rstrip("0123456789").rstrip("p")
    # NVMe
    if "nvme" in dev.lower():
        return "nvme"
    # Verifica rotacional via /sys
    rotational_path = f"/sys/block/{dev}/queue/rotational"
    if os.path.exists(rotational_path):
        try:
            with open(rotational_path) as f:
                return "hdd" if f.read().strip() == "1" else "ssd"
        except Exception:
            pass
    return "ssd"


def get_disk_info():
    """Obtém informações de todos os discos: partições, uso e I/O."""
    disks = []
    seen_devices = set()

    # Partições montadas
    for part in psutil.disk_partitions(all=False):
        if part.device in seen_devices:
            continue
        seen_devices.add(part.device)

        try:
            usage = psutil.disk_usage(part.mountpoint)
        except (PermissionError, OSError):
            continue

        disks.append({
            "device": part.device,
            "mountpoint": part.mountpoint,
            "fstype": part.fstype,
            "total_gb": round(usage.total / (1024**3), 1),
            "used_gb": round(usage.used / (1024**3), 1),
            "free_gb": round(usage.free / (1024**3), 1),
            "usage_percent": round(usage.percent, 1),
            "disk_type": get_disk_type(part.device),
        })

    # I/O por disco
    io_counters = {}
    try:
        io = psutil.disk_io_counters(perdisk=True)
        if io:
            for name, counters in io.items():
                io_counters[name] = {
                    "read_bytes": counters.read_bytes,
                    "write_bytes": counters.write_bytes,
                    "read_count": counters.read_count,
                    "write_count": counters.write_count,
                }
    except Exception:
        pass

    return {"partitions": disks, "io": io_counters}


# ==================== CONTROLE DE PWM ====================

def set_fan_speed(pwm_path, pwm_enable_path, speed_percent):
    pwm_value = int(speed_percent * 255 / 100)
    pwm_value = max(0, min(255, pwm_value))
    try:
        # Sempre coloca em modo manual (1) antes de definir velocidade
        if pwm_enable_path and os.path.exists(pwm_enable_path):
            with open(pwm_enable_path, "w") as f:
                f.write("1")
        with open(pwm_path, "w") as f:
            f.write(str(pwm_value))
        return True
    except PermissionError:
        print(f"ERRO: Sem permissão para escrever em {pwm_path}. Execute como root!")
        return False
    except Exception as e:
        print(f"ERRO ao definir fan speed: {e}")
        return False


def set_fan_auto(pwm_enable_path):
    """Coloca fan em modo automático via pwm_enable."""
    if not pwm_enable_path or not os.path.exists(pwm_enable_path):
        return False
    try:
        # Tenta modo 2 (auto controlado pelo hardware/BIOS)
        with open(pwm_enable_path, "w") as f:
            f.write("2")
        import time; time.sleep(0.05)
        with open(pwm_enable_path) as f:
            val = f.read().strip()
        if val == "2":
            return True
        # Fallback: modo 0 (firmware) para chips como amdgpu
        with open(pwm_enable_path, "w") as f:
            f.write("0")
        return True
    except PermissionError:
        print("ERRO set_fan_auto: sem permissão (root necessário)")
        return False
    except Exception as e:
        print(f"ERRO set_fan_auto: {e}")
        return False


def get_available_profiles():
    """Detecta quais perfis de energia estão disponíveis baseado nos governadores do sistema."""
    available_governors = []
    avail_path = "/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors"
    if os.path.exists(avail_path):
        try:
            with open(avail_path) as f:
                available_governors = f.read().strip().split()
        except (PermissionError, FileNotFoundError):
            pass

    has_pstate = os.path.exists("/sys/devices/system/cpu/intel_pstate")

    profiles = []
    if has_pstate:
        # intel_pstate suporta os 3 perfis via min/max_perf_pct
        profiles = ["silent", "balanced", "performance"]
    else:
        if "powersave" in available_governors:
            profiles.append("silent")
        if any(g in available_governors for g in ("schedutil", "ondemand", "conservative")):
            profiles.append("balanced")
        if "performance" in available_governors:
            profiles.append("performance")

    # Fallback: se nada detectado, mostra balanced
    if not profiles:
        profiles = ["balanced"]

    return profiles, available_governors, has_pstate


def get_current_profile(available_governors, has_pstate):
    """Detecta o perfil atual baseado no governador e configurações."""
    current_governor = ""
    try:
        gov_path = "/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"
        if os.path.exists(gov_path):
            with open(gov_path) as f:
                current_governor = f.read().strip()
    except Exception:
        pass

    if has_pstate:
        max_perf = 100
        no_turbo = 0
        try:
            mp = "/sys/devices/system/cpu/intel_pstate/max_perf_pct"
            if os.path.exists(mp):
                with open(mp) as f:
                    max_perf = int(f.read().strip())
            nt = "/sys/devices/system/cpu/intel_pstate/no_turbo"
            if os.path.exists(nt):
                with open(nt) as f:
                    no_turbo = int(f.read().strip())
        except Exception:
            pass

        if current_governor == "powersave" and max_perf <= 50:
            return "silent"
        elif current_governor == "powersave":
            return "balanced"
        elif current_governor == "performance":
            return "performance"
        return "balanced"
    else:
        gov_to_profile = {
            "powersave": "silent",
            "conservative": "silent",
            "schedutil": "balanced",
            "ondemand": "balanced",
            "performance": "performance",
        }
        return gov_to_profile.get(current_governor, "balanced")


# ==================== SERVIDOR WEBSOCKET ====================

class SensorServer:
    def __init__(self):
        self.clients = set()
        self.hwmon_devices = {}
        self.temp_sensors = {}
        self.fan_sensors = {}
        self.pwm_controls = {}
        self.temp_history = deque(maxlen=60)
        self.system_info = {}
        self.memory_slots_cache = None
        self.temp_label_map = {}
        self.current_profile = "balanced"
        self.available_profiles = ["balanced"]
        self.available_governors = []
        self.has_pstate = False
        # RAPL power tracking
        self.rapl_path = None
        self.prev_rapl_energy = None
        self.prev_rapl_time = None
        self.current_power = 0
        # Disk I/O tracking
        self.prev_disk_io = {}
        self.prev_disk_time = None
        # Fan name mapping: sequential index -> pwm key
        self.fan_index_map = {}  # "fan1" -> "chip_pwm1", etc.
        self.fan_modes  = {}    # fan_id -> "auto"|"manual"|"max"
        self.fan_speeds = {}    # fan_id -> 0-100
        self.config_path = "/etc/machctrl/settings.json"

        self.detect_hardware()
        self._load_settings()   # aplica configurações salvas após detectar hardware

    def _load_settings(self):
        """Carrega e aplica configurações salvas (perfil de energia + modos de fan)."""
        import json as _json
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path) as f:
                    cfg = _json.load(f)
                # Aplica perfil de energia salvo
                saved_profile = cfg.get("power_profile", "")
                if saved_profile and saved_profile in self.available_profiles:
                    import asyncio as _asyncio
                    # Aplica sincronicamente via subprocess direto
                    self._apply_profile_sync(saved_profile)
                    self.current_profile = saved_profile
                    print(f"⚙️  Perfil restaurado: {saved_profile}")
                # Restaura modos de fan
                self.fan_modes  = cfg.get("fan_modes",  {})
                self.fan_speeds = cfg.get("fan_speeds", {})
                # Aplica modos de fan
                for fan_id, mode in self.fan_modes.items():
                    pwm_name = self.fan_index_map.get(fan_id, fan_id)
                    if pwm_name in self.pwm_controls:
                        info = self.pwm_controls[pwm_name]
                        if mode == "auto":
                            set_fan_auto(info.get("pwm_enable"))
                        elif mode in ("manual", "max"):
                            speed = self.fan_speeds.get(fan_id, 100) if mode == "manual" else 100
                            set_fan_speed(info["pwm"], info.get("pwm_enable"), speed)
                print(f"⚙️  Configurações carregadas de {self.config_path}")
        except Exception as e:
            print(f"⚠️  Configurações não carregadas: {e}")

    def _save_settings(self):
        """Salva configurações atuais em disco."""
        import json as _json
        try:
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            cfg = {
                "power_profile": self.current_profile,
                "fan_modes":     self.fan_modes,
                "fan_speeds":    self.fan_speeds,
            }
            with open(self.config_path, "w") as f:
                _json.dump(cfg, f, indent=2)
        except Exception as e:
            print(f"⚠️  Não foi possível salvar configurações: {e}")

    def _apply_profile_sync(self, profile_name: str):
        """Aplica perfil de energia sincronicamente (para restauração no boot)."""
        try:
            gov_map = {
                "silent":      "powersave",
                "balanced":    next((g for g in ("schedutil", "ondemand", "powersave") if g in self.available_governors), "powersave"),
                "performance": "performance",
            }
            governor = gov_map.get(profile_name, "schedutil")
            cpu_count = __import__("psutil").cpu_count(logical=True) or 1
            for i in range(cpu_count):
                gov_path = f"/sys/devices/system/cpu/cpu{i}/cpufreq/scaling_governor"
                if os.path.exists(gov_path):
                    try:
                        with open(gov_path, "w") as f:
                            f.write(governor)
                    except PermissionError:
                        pass
        except Exception as e:
            print(f"⚠️  Erro ao aplicar perfil sync: {e}")

    def _classify_temp_sensors(self):
        # Mapeia chips coretemp / coretemp_1 / coretemp_2 → socket 0, 1, 2...
        coretemp_chips = sorted({
            lbl.split("/")[0] for lbl in self.temp_sensors
            if re.match(r"coretemp", lbl.split("/")[0].lower())
        })
        k10temp_chips = sorted({
            lbl.split("/")[0] for lbl in self.temp_sensors
            if re.match(r"k10temp|zenpower", lbl.split("/")[0].lower())
        })

        # Extrai índice de socket do nome: "coretemp" → 0, "coretemp_1" → 1
        def chip_socket_idx(chip_name, base):
            m = re.match(rf"{base}_(\d+)$", chip_name.lower())
            return int(m.group(1)) if m else 0

        chip_to_socket_coretemp = {
            chip: chip_socket_idx(chip, "coretemp") for chip in coretemp_chips
        }
        chip_to_socket_k10 = {
            chip: chip_socket_idx(chip, "k10temp") for chip in k10temp_chips
        }

        for label in self.temp_sensors:
            lower = label.lower()
            chip = label.split("/")[0] if "/" in label else ""
            sensor_name = label.split("/")[1] if "/" in label else label

            if re.match(r"coretemp", chip.lower()):
                socket_idx = chip_to_socket_coretemp.get(chip, 0)
                if "package" in lower:
                    self.temp_label_map[label] = f"cpu{socket_idx}_package"
                else:
                    core_match = re.search(r"core\s*(\d+)", lower)
                    if core_match:
                        self.temp_label_map[label] = f"cpu{socket_idx}_core_{core_match.group(1)}"
                    else:
                        self.temp_label_map[label] = f"cpu{socket_idx}_{sensor_name.lower().replace(' ', '_')}"

            elif re.match(r"k10temp|zenpower", chip.lower()):
                socket_idx = chip_to_socket_k10.get(chip, 0)
                if "tctl" in lower or "tdie" in lower:
                    self.temp_label_map[label] = f"cpu{socket_idx}_package"
                elif re.search(r"tccd\d*", lower):
                    ccd_match = re.search(r"tccd(\d+)", lower)
                    cid = ccd_match.group(1) if ccd_match else "0"
                    self.temp_label_map[label] = f"cpu{socket_idx}_core_{cid}"
                else:
                    self.temp_label_map[label] = f"cpu{socket_idx}_{sensor_name.lower().replace(' ', '_')}"

            elif re.match(r"amdgpu|radeon|nouveau", chip.lower()):
                self.temp_label_map[label] = "gpu"
            elif "nvme" in chip.lower():
                self.temp_label_map[label] = f"nvme_{chip}"
            elif re.match(r"nct|it87|w83", chip.lower()):
                if "systin" in lower or "system" in lower:
                    self.temp_label_map[label] = "board"
                elif "cputin" in lower:
                    self.temp_label_map[label] = "cpu_board"
                else:
                    self.temp_label_map[label] = sensor_name.lower().replace(" ", "_")
            else:
                self.temp_label_map[label] = sensor_name.lower().replace(" ", "_")

    def detect_hardware(self):
        print("=" * 60)
        print("🔍 MachCtrl - Detectando hardware...")
        print("=" * 60)

        self.hwmon_devices = find_hwmon_devices()

        if not self.hwmon_devices:
            print("⚠️  Nenhum dispositivo hwmon encontrado!")
        else:
            print(f"\n📦 Dispositivos hwmon: {len(self.hwmon_devices)}")
            for name, path in self.hwmon_devices.items():
                print(f"   • {name}: {path}")
                temps = find_temp_sensors(path)
                if temps:
                    self.temp_sensors.update({f"{name}/{k}": v for k, v in temps.items()})
                    for label in temps:
                        print(f"     🌡️  {label}")
                fans = find_fan_sensors(path)
                if fans:
                    self.fan_sensors.update({f"{name}/{k}": v for k, v in fans.items()})
                    for label in fans:
                        print(f"     🌀 {label}")

        self.pwm_controls = find_all_pwm()
        if self.pwm_controls:
            print(f"\n🎛️  Controles PWM: {len(self.pwm_controls)}")
            for i, (name, info) in enumerate(self.pwm_controls.items(), 1):
                self.fan_index_map[f"fan{i}"] = name
                print(f"   • fan{i} -> {name}: {info['pwm']}")

        self._classify_temp_sensors()
        print(f"\n🌡️  Mapa de temperaturas:")
        for label, category in self.temp_label_map.items():
            print(f"   • {label} → {category}")

        # Debug mapa de fans
        print(f"\n🌀 Mapa de controle PWM (fan_id -> pwm_name -> paths):")
        for fid, pwm_name in self.fan_index_map.items():
            ctrl = self.pwm_controls.get(pwm_name, {})
            print(f"   • {fid} -> {pwm_name}: pwm={ctrl.get('pwm','?')} enable={ctrl.get('pwm_enable','?')} fan_input={ctrl.get('fan_input','?')}")

        # Memória
        print("\n💾 Detectando slots de memória...")
        mem_info = get_memory_info()
        self.memory_slots_cache = {
            "slots": mem_info["slots"],
            "total_slots": mem_info["total_slots"],
            "occupied_slots": mem_info["occupied_slots"],
        }
        print(f"   Slots: {self.memory_slots_cache['occupied_slots']}/{self.memory_slots_cache['total_slots']} ocupados")
        for s in self.memory_slots_cache["slots"]:
            print(f"   • {s['locator']}: {s['size_gb']}GB {s['type']} @ {s['configured_speed_mhz']}MT/s {s['voltage']}V")

        # RAPL power
        self.rapl_path = get_cpu_power()
        if self.rapl_path:
            print(f"\n⚡ RAPL detectado: {self.rapl_path}")
        else:
            print("\n⚠️  RAPL não detectado - consumo não disponível")

        # Perfis de energia
        self.available_profiles, self.available_governors, self.has_pstate = get_available_profiles()
        self.current_profile = get_current_profile(self.available_governors, self.has_pstate)
        print(f"\n🔋 Perfis disponíveis: {self.available_profiles}")
        print(f"   Perfil atual: {self.current_profile}")
        print(f"   Governadores: {self.available_governors}")
        print(f"   intel_pstate: {self.has_pstate}")

        self.system_info = get_system_info()
        print(f"\n💻 Sistema: {self.system_info.get('os', 'N/A')}")
        print(f"   Placa: {self.system_info.get('board', 'N/A')}")
        print("=" * 60)
        print(f"🚀 Servidor WebSocket em ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}")
        print("=" * 60)

    def read_all_sensors(self):
        now = datetime.now()

        # Temperaturas
        temperatures = {}
        cpus_temps = {}  # socket_idx -> {"package": float, "cores": {core_idx: float}}
        for label, path in self.temp_sensors.items():
            value = read_sensor_file(path)
            if value is None:
                continue
            category = self.temp_label_map.get(label, label)
            temp_c = round(value / 1000, 1)
            if not (-40 < temp_c < 150):
                continue
            temperatures[category] = temp_c

            # Extrai cpuN_package / cpuN_core_M
            m = re.match(r"cpu(\d+)_(package|core_(\d+))", category)
            if m:
                sock = int(m.group(1))
                cpus_temps.setdefault(sock, {"package": 0, "cores": {}})
                if m.group(2) == "package":
                    cpus_temps[sock]["package"] = temp_c
                else:
                    cpus_temps[sock]["cores"][int(m.group(3))] = temp_c

        # CPU info (with per-thread usages) for merging into cores
        cpu_info_pre = get_cpu_info()
        # Build lookup: socket_id -> thread_usages dict
        sock_thread_usages = {}
        sock_thread_freqs = {}
        for s in cpu_info_pre.get("sockets", []):
            sock_thread_usages[s["id"]] = s.get("thread_usages", {})
            sock_thread_freqs[s["id"]] = s.get("thread_freqs", {})

        # Lista ordenada por socket
        cpus_temps_list = []
        for sock in sorted(cpus_temps.keys()):
            entry = cpus_temps[sock]
            thread_usages_map = sock_thread_usages.get(sock, {})
            thread_freqs_map = sock_thread_freqs.get(sock, {})

            thread_ids = sorted(thread_usages_map.keys())
            core_ids   = sorted(entry["cores"].keys())
            threads_per_core = max(1, len(thread_ids) // max(1, len(core_ids))) if core_ids else 1

            # Mapa core_id -> temperatura do sensor
            core_temp_map = dict(entry["cores"])

            # Para cada thread lógico, calcula usage e estima temp
            all_threads = []
            for ti, tid in enumerate(thread_ids):
                # Descobre qual core físico este thread pertence
                core_idx = ti // threads_per_core if threads_per_core > 0 else ti
                phys_core_id = core_ids[core_idx] if core_idx < len(core_ids) else (core_ids[-1] if core_ids else 0)
                temp = core_temp_map.get(phys_core_id, entry["package"])
                usage = thread_usages_map.get(tid, 0)
                all_threads.append({
                    "id": tid,
                    "core": phys_core_id,
                    "temp": temp,
                    "usage": round(usage, 1),
                    "is_ht": (ti % threads_per_core) != 0,
                })

            # Fallback: se não há thread_usages, usa só os cores com sensor
            if not all_threads:
                all_threads = [
                    {"id": cid, "core": cid, "temp": entry["cores"][cid], "usage": 0, "is_ht": False}
                    for cid in core_ids
                ]

            cpus_temps_list.append({
                "socket": sock,
                "package": entry["package"],
                "cores": all_threads,   # agora inclui TODOS os threads lógicos
            })

        # Compatibilidade: cpu/gpu/board agregados
        if cpus_temps_list and "cpu" not in temperatures:
            temperatures["cpu"] = cpus_temps_list[0]["package"]

        # Garante que TODOS os sockets físicos aparecem — mesmo sem sensor de temp
        # Mescla cpus_temps com a topologia real da CPU
        existing_sockets = {c["socket"] for c in cpus_temps_list}
        for sock_info in cpu_info_pre.get("sockets", []):
            sid = sock_info["id"]
            thread_usages_map = sock_info.get("thread_usages", {})
            thread_ids = sorted(thread_usages_map.keys())
            core_count = sock_info.get("core_count", max(1, len(thread_ids) // 2))
            threads_per_core = max(1, len(thread_ids) // max(1, core_count))

            if sid not in existing_sockets:
                # Socket sem sensor → usa temp agregada se disponível
                cpu_temp_agg = temperatures.get("cpu", 0)
                cores_fb = []
                for ci in range(core_count):
                    start = ci * threads_per_core
                    end = start + threads_per_core
                    relevant = [thread_usages_map[t] for t in thread_ids[start:end] if t in thread_usages_map]
                    usage = round(sum(relevant) / len(relevant), 1) if relevant else 0
                    cores_fb.append({"id": ci, "temp": cpu_temp_agg, "usage": usage})
                cpus_temps_list.append({
                    "socket": sid,
                    "package": cpu_temp_agg,
                    "cores": cores_fb,
                })
                print(f"ℹ️  Socket {sid} sem sensor de temp — adicionado via topologia")
            else:
                # Socket com sensor → garante que usage está correto por núcleo
                for entry in cpus_temps_list:
                    if entry["socket"] == sid and not any(c.get("usage", 0) > 0 for c in entry["cores"]):
                        # recalcula usage
                        for ci, core in enumerate(entry["cores"]):
                            cid = core["id"]
                            start = ci * threads_per_core
                            end = start + threads_per_core
                            relevant = [thread_usages_map[t] for t in thread_ids[start:end] if t in thread_usages_map]
                            core["usage"] = round(sum(relevant) / len(relevant), 1) if relevant else 0

        # Ordena por socket
        cpus_temps_list.sort(key=lambda x: x["socket"])

        # Fallback absoluto: se ainda vazio, usa topologia pura
        if not cpus_temps_list and cpu_info_pre.get("sockets"):
            cpu_temp_agg = temperatures.get("cpu", 0)
            for sock_info in cpu_info_pre["sockets"]:
                sid = sock_info["id"]
                thread_usages_map = sock_info.get("thread_usages", {})
                thread_ids = sorted(thread_usages_map.keys())
                core_count = sock_info.get("core_count", max(1, len(thread_ids) // 2))
                threads_per_core = max(1, len(thread_ids) // max(1, core_count))
                cores_fb = []
                for ci in range(core_count):
                    start = ci * threads_per_core
                    end = start + threads_per_core
                    relevant = [thread_usages_map[t] for t in thread_ids[start:end] if t in thread_usages_map]
                    usage = round(sum(relevant) / len(relevant), 1) if relevant else 0
                    cores_fb.append({"id": ci, "temp": cpu_temp_agg, "usage": usage})
                cpus_temps_list.append({"socket": sid, "package": cpu_temp_agg, "cores": cores_fb})

        # Fans - enviar com índice sequencial para o frontend
        fans = {}
        # Mapa mais confiável: pwm_path -> (fan_id, ctrl)
        pwmpath_to_fanid = {}
        for fid, pwm_name in self.fan_index_map.items():
            ctrl = self.pwm_controls.get(pwm_name, {})
            pwm_p = ctrl.get("pwm", "")
            if pwm_p:
                pwmpath_to_fanid[pwm_p] = (fid, ctrl)

        fan_list = []
        for label, info in self.fan_sensors.items():
            rpm = read_sensor_file(info["input"])

            # Deriva o pwm_path do fan: mesmo hwmon dir, mesmo índice
            inp = info.get("input", "")
            hwmon_dir = os.path.dirname(inp)
            fan_m = re.search(r"fan(\d+)_input$", inp)
            fan_id = ""
            pwm_path = ""
            pwm_enable = None

            if fan_m:
                idx = fan_m.group(1)
                derived_pwm = os.path.join(hwmon_dir, f"pwm{idx}")
                derived_enable = os.path.join(hwmon_dir, f"pwm{idx}_enable")

                # Busca no mapa por pwm_path
                hit = pwmpath_to_fanid.get(derived_pwm)
                if hit:
                    fan_id = hit[0]
                    pwm_path = derived_pwm
                    pwm_enable = derived_enable if os.path.exists(derived_enable) else None
                elif os.path.exists(derived_pwm):
                    # PWM existe mas não está no fan_index_map (ex: amdgpu sem fan_input)
                    pwm_path = derived_pwm
                    pwm_enable = derived_enable if os.path.exists(derived_enable) else None
                    # Tenta achar o fan_id pelo chip name
                    try:
                        with open(os.path.join(hwmon_dir, "name")) as f:
                            cname = f.read().strip()
                        for fid2, pname2 in self.fan_index_map.items():
                            if pname2 == f"{cname}_pwm{idx}":
                                fan_id = fid2
                                break
                        if not fan_id:
                            # Último recurso: usa label como fan_id
                            fan_id = label
                    except Exception:
                        fan_id = label

            pwm_val = read_sensor_file(pwm_path) if pwm_path and os.path.exists(pwm_path) else None
            speed_pct = round(pwm_val / 255 * 100) if pwm_val is not None else 0

            # Nome amigável
            chip = label.split("/")[0] if "/" in label else label
            fan_label_part = label.split("/")[1] if "/" in label else label
            if re.match(r"amdgpu|radeon", chip.lower()):
                gpu_name = self.system_info.get("gpu_name", "") if self.system_info else ""
                friendly = f"{gpu_name or 'GPU'} — Fan"
            elif re.match(r"nct|it87|w83", chip.lower()):
                friendly = f"Fan {fan_label_part.replace('Fan ', '').strip()}"
            else:
                friendly = f"{chip} Fan"

            fan_list.append({
                "label":         friendly,
                "name":          fan_id or label,
                "label_full":    label,
                "rpm":           rpm or 0,
                "speed_percent": speed_pct,
                "has_pwm":       bool(pwm_path and os.path.exists(pwm_path)),
                "mode":          self.fan_modes.get(fan_id or label, "auto"),
            })

        # CPU
        cpu_info = cpu_info_pre  # já calculado acima com per-thread usages

        # CPU Power via RAPL
        if self.rapl_path:
            watts, energy, t = read_rapl_power(
                self.rapl_path, self.prev_rapl_energy, self.prev_rapl_time
            )
            self.prev_rapl_energy = energy
            self.prev_rapl_time = t
            if watts > 0:
                self.current_power = watts

        # CPU Voltage
        cpu_voltage = get_cpu_voltage()

        # Memória
        mem = psutil.virtual_memory()
        mem_info = {
            "usage": round(mem.percent, 1),
            "total_gb": round(mem.total / (1024**3), 1),
            "used_gb": round(mem.used / (1024**3), 1),
            "slots": self.memory_slots_cache["slots"] if self.memory_slots_cache else [],
            "total_slots": self.memory_slots_cache["total_slots"] if self.memory_slots_cache else 0,
            "occupied_slots": self.memory_slots_cache["occupied_slots"] if self.memory_slots_cache else 0,
        }

        # Discos
        disk_info = get_disk_info()
        # Calcula I/O rates
        disk_rates = {}
        now_time = time.time()
        if self.prev_disk_io and self.prev_disk_time:
            dt = now_time - self.prev_disk_time
            if dt > 0:
                for name, counters in disk_info["io"].items():
                    prev = self.prev_disk_io.get(name)
                    if prev:
                        read_rate = (counters["read_bytes"] - prev["read_bytes"]) / dt
                        write_rate = (counters["write_bytes"] - prev["write_bytes"]) / dt
                        disk_rates[name] = {
                            "read_mb_s": round(max(0, read_rate) / (1024 * 1024), 1),
                            "write_mb_s": round(max(0, write_rate) / (1024 * 1024), 1),
                        }
        self.prev_disk_io = disk_info["io"]
        self.prev_disk_time = now_time

        # Uptime
        self.system_info["uptime"] = get_system_info()["uptime"]

        # Histórico inclui temps por socket/núcleo
        temp_point = {
            "time": now.strftime("%M:%S"),
            "cpu": temperatures.get("cpu", 0),
            "gpu": temperatures.get("gpu", 0),
            "board": temperatures.get("board", 0),
        }
        for c in cpus_temps_list:
            temp_point[f"cpu{c['socket']}_pkg"] = c["package"]
            for core in c["cores"]:
                temp_point[f"cpu{c['socket']}_c{core['id']}"] = core["temp"]
        self.temp_history.append(temp_point)

        # Governador atual
        current_governor = ""
        try:
            gov_path = "/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"
            if os.path.exists(gov_path):
                with open(gov_path) as f:
                    current_governor = f.read().strip()
        except Exception:
            pass

        return {
            "type": "sensor_data",
            "timestamp": now.isoformat(),
            "temperatures": temperatures,
            "cpus_temps": cpus_temps_list,
            "fans": fan_list,
            "cpu": cpu_info,
            "cpu_power": self.current_power,
            "cpu_voltage": cpu_voltage,
            "memory": mem_info,
            "disks": {
                "partitions": disk_info["partitions"],
                "io_rates": disk_rates,
            },
            "system": self.system_info,
            "top_processes": get_top_processes(10),
            "temp_history": list(self.temp_history),
            "current_governor": current_governor,
            "current_profile": self.current_profile,
            "available_profiles": self.available_profiles,
            "detected_sensors": {
                "temp_count": len(self.temp_sensors),
                "fan_count": len(self.fan_sensors),
                "pwm_count": len(self.pwm_controls),
            },
            "pwm_names": list(self.pwm_controls.keys()),
            "fan_map": self.fan_index_map,
        }

    async def handler(self, websocket):
        self.clients.add(websocket)
        client_addr = websocket.remote_address
        print(f"✅ Cliente conectado: {client_addr}")
        try:
            data = self.read_all_sensors()
            data["type"] = "initial_data"
            await websocket.send(json.dumps(data))
            async for message in websocket:
                try:
                    cmd = json.loads(message)
                    await self.handle_command(websocket, cmd)
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({"type": "error", "message": "JSON inválido"}))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            print(f"❌ Cliente desconectado: {client_addr}")

    async def handle_command(self, websocket, cmd):
        action = cmd.get("action")

        def resolve_fan_ctrl(fan_key):
            """Resolve fan_key -> (pwm_path, pwm_enable_path). Funciona para fan1..fanN e labels."""
            # Tenta pelo fan_index_map primeiro
            pwm_name = self.fan_index_map.get(fan_key)
            if pwm_name and pwm_name in self.pwm_controls:
                ctrl = self.pwm_controls[pwm_name]
                return ctrl.get("pwm", ""), ctrl.get("pwm_enable")
            # Tenta direto em pwm_controls (fan_key pode ser o pwm_name)
            if fan_key in self.pwm_controls:
                ctrl = self.pwm_controls[fan_key]
                return ctrl.get("pwm", ""), ctrl.get("pwm_enable")
            # Tenta derivar do label (ex: "amdgpu/Fan 1" -> hwmon2/pwm1)
            for label, info in self.fan_sensors.items():
                if label == fan_key or fan_key in label:
                    inp = info.get("input", "")
                    hwmon_dir = os.path.dirname(inp)
                    m = re.search(r"fan(\d+)_input$", inp)
                    if m:
                        pwm_p = os.path.join(hwmon_dir, f"pwm{m.group(1)}")
                        pwm_e = os.path.join(hwmon_dir, f"pwm{m.group(1)}_enable")
                        if os.path.exists(pwm_p):
                            return pwm_p, (pwm_e if os.path.exists(pwm_e) else None)
            return "", None

        if action == "set_fan_speed":
            fan_key = cmd.get("fan", "")
            speed   = cmd.get("speed", 50)
            pwm_path, pwm_enable = resolve_fan_ctrl(fan_key)

            if pwm_path:
                success = set_fan_speed(pwm_path, pwm_enable, speed)
                if success:
                    self.fan_modes[fan_key]  = "manual" if speed < 100 else "max"
                    self.fan_speeds[fan_key] = speed
                    self._save_settings()
                await websocket.send(json.dumps({
                    "type": "command_result", "action": "set_fan_speed",
                    "success": success, "fan": fan_key, "speed": speed,
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Fan '{fan_key}' não encontrado. fan_index_map={self.fan_index_map}"
                }))

        elif action == "set_fan_auto":
            fan_key = cmd.get("fan", "")
            pwm_path, pwm_enable = resolve_fan_ctrl(fan_key)
            if pwm_path:
                success = set_fan_auto(pwm_enable)
                if success:
                    self.fan_modes.pop(fan_key, None)
                    self.fan_speeds.pop(fan_key, None)
                    self._save_settings()
                await websocket.send(json.dumps({
                    "type": "command_result", "action": "set_fan_auto",
                    "success": success, "fan": fan_key,
                }))
        elif action == "set_profile":
            profile_name = cmd.get("profile", "balanced")
            success = True
            applied_governor = ""

            try:
                cpu_count = psutil.cpu_count(logical=True) or 1

                if self.has_pstate:
                    gov_map = {
                        "silent": "powersave",
                        "balanced": "powersave",
                        "performance": "performance",
                    }
                else:
                    gov_map = {
                        "silent": "powersave",
                        "balanced": next((g for g in ("schedutil", "ondemand") if g in self.available_governors), "powersave"),
                        "performance": "performance",
                    }

                governor = gov_map.get(profile_name, "powersave")
                if governor not in self.available_governors and self.available_governors:
                    governor = self.available_governors[0]
                applied_governor = governor

                for i in range(cpu_count):
                    gov_path = f"/sys/devices/system/cpu/cpu{i}/cpufreq/scaling_governor"
                    if os.path.exists(gov_path):
                        try:
                            with open(gov_path, "w") as f:
                                f.write(governor)
                        except PermissionError:
                            success = False

                if self.has_pstate:
                    perf_settings = {
                        "silent":      {"no_turbo": "1", "min_perf": "15", "max_perf": "50"},
                        "balanced":    {"no_turbo": "0", "min_perf": "20", "max_perf": "80"},
                        "performance": {"no_turbo": "0", "min_perf": "30", "max_perf": "100"},
                    }
                    settings = perf_settings.get(profile_name, perf_settings["balanced"])
                    for path, val in [
                        ("/sys/devices/system/cpu/intel_pstate/no_turbo", settings["no_turbo"]),
                        ("/sys/devices/system/cpu/intel_pstate/min_perf_pct", settings["min_perf"]),
                        ("/sys/devices/system/cpu/intel_pstate/max_perf_pct", settings["max_perf"]),
                    ]:
                        if os.path.exists(path):
                            try:
                                with open(path, "w") as f:
                                    f.write(val)
                            except PermissionError:
                                print(f"   ❌ Sem permissão: {path}")
                else:
                    if profile_name == "silent":
                        for i in range(cpu_count):
                            max_path = f"/sys/devices/system/cpu/cpu{i}/cpufreq/scaling_max_freq"
                            max_info = f"/sys/devices/system/cpu/cpu{i}/cpufreq/cpuinfo_max_freq"
                            if os.path.exists(max_path) and os.path.exists(max_info):
                                try:
                                    with open(max_info) as f:
                                        max_freq = int(f.read().strip())
                                    with open(max_path, "w") as f:
                                        f.write(str(int(max_freq * 0.6)))
                                except (PermissionError, ValueError):
                                    pass
                    else:
                        for i in range(cpu_count):
                            max_path = f"/sys/devices/system/cpu/cpu{i}/cpufreq/scaling_max_freq"
                            max_info = f"/sys/devices/system/cpu/cpu{i}/cpufreq/cpuinfo_max_freq"
                            if os.path.exists(max_path) and os.path.exists(max_info):
                                try:
                                    with open(max_info) as f:
                                        max_freq = f.read().strip()
                                    with open(max_path, "w") as f:
                                        f.write(max_freq)
                                except (PermissionError, ValueError):
                                    pass

                self.current_profile = profile_name
                self._save_settings()   # persiste em /etc/machctrl/settings.json
                print(f"✅ Perfil '{profile_name}' aplicado: governor={applied_governor}")

                # Persiste o perfil após reboot via /etc/default/cpupower (se disponível)
                cpupower_conf = "/etc/default/cpupower"
                if os.path.exists(cpupower_conf):
                    try:
                        with open(cpupower_conf, "r") as f:
                            content = f.read()
                        import re as _re
                        content = _re.sub(
                            r"^governor=.*$", f"governor='{applied_governor}'",
                            content, flags=_re.MULTILINE
                        )
                        with open(cpupower_conf, "w") as f:
                            f.write(content)
                        print(f"   💾 Perfil persistido em {cpupower_conf}")
                    except Exception as e:
                        print(f"   ⚠  Não foi possível persistir perfil: {e}")

            except Exception as e:
                print(f"Erro ao aplicar perfil {profile_name}: {e}")
                success = False

            await websocket.send(json.dumps({
                "type": "command_result",
                "action": "set_profile",
                "success": success,
                "profile": profile_name,
                "governor": applied_governor,
            }))

        elif action == "get_sensors":
            data = self.read_all_sensors()
            await websocket.send(json.dumps(data))

        elif action == "restart_service":
            await websocket.send(json.dumps({
                "type": "command_result",
                "action": "restart_service",
                "success": True,
                "message": "Reiniciando backend...",
            }))
            print("🔄 Reinício solicitado pelo cliente. Saindo para que o systemd/supervisor reinicie...")
            # Encerra com código != 0 para o systemd reiniciar (Restart=always)
            asyncio.get_event_loop().call_later(0.5, lambda: os._exit(0))

    async def broadcast_loop(self):
        while True:
            if self.clients:
                data = self.read_all_sensors()
                data["type"] = "sensors_update"
                message = json.dumps(data)
                dead_clients = set()
                for client in self.clients:
                    try:
                        await client.send(message)
                    except websockets.exceptions.ConnectionClosed:
                        dead_clients.add(client)
                self.clients -= dead_clients
            await asyncio.sleep(UPDATE_INTERVAL)

    async def run(self):
        async with websockets.serve(self.handler, WEBSOCKET_HOST, WEBSOCKET_PORT):
            print(f"🟢 MachCtrl Backend rodando em ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}")
            await self.broadcast_loop()


if __name__ == "__main__":
    import socket as _socket

    def _port_in_use(port):
        with _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM) as s:
            return s.connect_ex(('127.0.0.1', port)) == 0

    # Se a porta já está em uso, outro backend já está rodando — sai sem erro
    if _port_in_use(WEBSOCKET_PORT):
        print(f"ℹ️  Porta {WEBSOCKET_PORT} já em uso — backend já está rodando. Saindo.")
        # Escreve a porta no arquivo de lock para o Electron saber
        try:
            import tempfile, os
            lock = os.path.join(tempfile.gettempdir(), 'machctrl.port')
            with open(lock, 'w') as f:
                f.write(str(WEBSOCKET_PORT))
        except Exception:
            pass
        raise SystemExit(0)

    # Tenta porta alternativa se necessário (fallback)
    port = WEBSOCKET_PORT
    for try_port in range(WEBSOCKET_PORT, WEBSOCKET_PORT + 10):
        if not _port_in_use(try_port):
            port = try_port
            break

    if port != WEBSOCKET_PORT:
        print(f"⚠️  Porta {WEBSOCKET_PORT} ocupada — usando porta {port}")
        WEBSOCKET_PORT = port

    # Escreve porta no arquivo de lock para o Electron conectar
    try:
        import tempfile, os
        lock = os.path.join(tempfile.gettempdir(), 'machctrl.port')
        with open(lock, 'w') as f:
            f.write(str(WEBSOCKET_PORT))
        print(f"📝 Porta gravada em {lock}")
    except Exception as e:
        print(f"⚠️  Não foi possível gravar porta: {e}")

    server = SensorServer()
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        print("\n🔴 MachCtrl Backend finalizado.")
    finally:
        # Remove lock file
        try:
            import tempfile, os
            lock = os.path.join(tempfile.gettempdir(), 'machctrl.port')
            if os.path.exists(lock):
                os.remove(lock)
        except Exception:
            pass

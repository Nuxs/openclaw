import json
import sys
import urllib.request



def fetch_json(url: str, timeout: int = 15) -> dict | list | None:
    """Fetch JSON from URL and return `None` on failure."""
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "ETH-Oracle/1.0"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except Exception as error:
        print(f"  [WARN] Failed to fetch {url[:80]}...: {error}", file=sys.stderr)
        return None



def fetch_text(url: str, timeout: int = 15) -> str | None:
    """Fetch raw text from URL and return `None` on failure."""
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "ETH-Oracle/1.0"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode()
    except Exception:
        return None

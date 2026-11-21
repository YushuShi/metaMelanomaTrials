"""Reconcile the frozen Opus review and prepare About-page review data offline."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from metamelanoma.complementary_routing import reconcile

if __name__ == '__main__':
    reconcile(ROOT)

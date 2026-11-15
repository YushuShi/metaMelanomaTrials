#!/usr/bin/env python3
"""Run the canonical melanoma evidence workflow from this folder."""
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent/"src"))
from metamelanoma.cli import main

if __name__=="__main__":main()

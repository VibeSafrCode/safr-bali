#!/usr/bin/env python3
"""Verify files inside the package against SHA256SUMS.txt, without external tools."""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
lines=(root/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines()
errors=[];checked=0
for line in lines:
    if not line.strip(): continue
    digest,sep,filename=line.partition('  ')
    path=root/filename
    if not sep or not path.is_file(): errors.append(f'MISSING {filename}');continue
    actual=hashlib.sha256(path.read_bytes()).hexdigest()
    if actual!=digest:errors.append(f'MISMATCH {filename}')
    checked+=1
if errors:
    for err in errors:print('FAIL:',err)
    raise SystemExit(1)
print(f'SHA256 PASS | {checked}/{checked} files')

#!/usr/bin/env python3
"""Check eight head-with-hair/body PNGs; optionally check a legacy 12-view set."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib

PARTS = ('head', 'body')
VIEWS = ('front', 'left', 'right', 'back')

def png_info(path):
    data = path.read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not a PNG: ' + str(path))
    pos, dims, ended = 8, None, False
    while pos + 12 <= len(data):
        size = struct.unpack_from('>I', data, pos)[0]
        end = pos + 12 + size
        if end > len(data):
            raise ValueError('Truncated PNG: ' + str(path))
        kind = data[pos + 4:pos + 8]
        payload = data[pos + 8:pos + 8 + size]
        crc = struct.unpack_from('>I', data, pos + 8 + size)[0]
        if zlib.crc32(kind + payload) & 0xffffffff != crc:
            raise ValueError('PNG CRC mismatch: ' + str(path))
        if kind == b'IHDR':
            dims = struct.unpack_from('>II', payload)
        if kind == b'IEND':
            ended = True
            break
        pos = end
    if not dims or not ended or not dims[0] or dims[0] != dims[1]:
        raise ValueError('Expected complete square PNG: ' + str(path))
    return dict(width=dims[0], height=dims[1], bytes=len(data), sha256=hashlib.sha256(data).hexdigest())

def check(directory, parts=PARTS):
    root = Path(directory)
    entries = []
    for part in parts:
        for view in VIEWS:
            relative = part + '/' + view + '.png'
            entries.append(dict(file=relative, part=part, view=view, **png_info(root / relative)))
    for part in parts:
        if len({(x['width'], x['height']) for x in entries if x['part'] == part}) != 1:
            raise ValueError('Canvas dimensions differ inside part: ' + part)
    manifest = dict(format='character-parts-images', version=1, count=len(entries),
                    parts=list(parts),
                    directionConvention={'left':'character left side; front points image left', 'right':'character right side; front points image right'},
                    validation='File integrity and dimensions only; visual / 3D consistency requires review', images=entries)
    (root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--legacy-three-parts', action='store_true', help='Check the old head/hair/body set')
    args = parser.parse_args()
    result = check(args.directory, ('head', 'hair', 'body') if args.legacy_three_parts else PARTS)
    print(json.dumps({'count': result['count'], 'manifest': str(Path(args.directory) / 'manifest.json')}, ensure_ascii=False))

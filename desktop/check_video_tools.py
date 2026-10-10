"""Check the real local OCR engine without starting CurbSentry or any model."""
import argparse
import json
from pathlib import Path
from main import DataLock, default_root, load_config
from curbsentry import BUILD_ID
from curbsentry.ocr import diagnostics

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=default_root())
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    lock = DataLock(args.data)
    try:
        config = load_config(args.data, 8766)
        report = diagnostics(config, args.data) | dict(build=BUILD_ID)
        for name, result in report["checks"].items():
            print(f"{name}: {'PASS' if result['ok'] else 'NEEDS ATTENTION'} {result.get('version', result.get('message', ''))}")
        if args.output:
            args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return 0 if report["ready"] else 2
    finally:
        lock.close()

if __name__ == "__main__":
    raise SystemExit(main())

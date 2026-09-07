"""Optional maintainer tool for rebuilding the checked-in public card catalog.

The website build never invokes this script. Pass an explicit workbook path so
the standalone ``pages-demo`` folder has no implicit dependency on repository
files, bot modules, player saves, or configuration.

Usage: python scripts/export_cards.py PATH_TO_CARD_WORKBOOK.xlsx
"""
import json
import sys
from collections import Counter
from pathlib import Path

import openpyxl

WEB_ROOT = Path(__file__).resolve().parents[1]
DEST = WEB_ROOT / "lib" / "cards.json"


def export(workbook_path: Path):
    workbook = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    cards = []
    seen = set()
    missing = 0
    try:
        for sheet, kind in [("BattleCard资源", "battle"), ("AssistCard资源", "assist")]:
            for row in workbook[sheet].iter_rows(min_row=2, values_only=True):
                if not all(row[i] is not None for i in (1, 4, 5, 6)):
                    continue
                stars = int(row[1])
                if stars not in (1, 2, 3):
                    continue
                card_id, art_id = str(int(row[5])), str(int(row[6]))
                if card_id in seen:
                    raise ValueError(f"Duplicate card ID: {card_id}")
                seen.add(card_id)
                image = f"card_cutin_{art_id}.png"
                if not (WEB_ROOT / "assets" / "cards" / "thumb" / image.replace(".png", ".webp")).is_file():
                    image = None
                    missing += 1
                cards.append({
                    "id": card_id, "name": str(row[4]).strip(), "stars": stars,
                    "type": kind, "attribute": str(row[3] or "红"),
                    "limit": str(row[0] or ""), "sourceImage": image,
                })
    finally:
        workbook.close()
    if not cards or not any(c["limit"] == "フェス限定" for c in cards):
        raise ValueError("Incomplete card pool")
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(cards)} public cards; {missing} without artwork.")
    print(dict(Counter(c["stars"] for c in cards)))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/export_cards.py PATH_TO_CARD_WORKBOOK.xlsx")
    export(Path(sys.argv[1]).resolve())

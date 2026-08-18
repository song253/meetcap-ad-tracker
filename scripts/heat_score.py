"""
오늘 스냅샷과 가장 최근 이전 스냅샷을 비교해서 브랜드별 "화력 지수"를 계산한다.

화력 지수 = 활성 광고 수 + (신규 소재 수 * 3)
- 활성 광고 수: 지금 얼마나 넓게 광고를 태우고 있는가
- 신규 소재 수: 어제 없던 광고가 오늘 몇 개 새로 나타났는가 (액티브하게 테스트/증액 중이라는 신호라 가중치를 더 준다)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_DIR = ROOT / "data" / "snapshots"

NEW_AD_WEIGHT = 3


def _load_snapshots():
    files = sorted(SNAPSHOT_DIR.glob("*.json"))
    return files


def build_report():
    files = _load_snapshots()
    if not files:
        raise SystemExit("스냅샷이 없습니다. 먼저 scrape_daily.py를 실행하세요.")

    today_data = json.loads(files[-1].read_text(encoding="utf-8"))
    prev_data = json.loads(files[-2].read_text(encoding="utf-8")) if len(files) >= 2 else None
    prev_by_name = {b["name"]: b for b in prev_data["brands"]} if prev_data else {}

    rows = []
    for brand in today_data["brands"]:
        name = brand["name"]
        total = brand.get("total_count") or 0
        today_ids = {ad["library_id"] for ad in brand.get("ads", [])}

        prev_brand = prev_by_name.get(name)
        if prev_brand:
            prev_ids = {ad["library_id"] for ad in prev_brand.get("ads", [])}
            prev_total = prev_brand.get("total_count") or 0
        else:
            prev_ids = set()
            prev_total = None

        new_ids = today_ids - prev_ids if prev_brand else set()
        dropped_ids = prev_ids - today_ids if prev_brand else set()

        heat_score = total + NEW_AD_WEIGHT * len(new_ids)

        # 가장 오래 살아남은(=검증된 승자) 소재 하나
        dated_ads = [a for a in brand.get("ads", []) if a.get("start_date")]
        oldest = min(dated_ads, key=lambda a: a["start_date"]) if dated_ads else None

        rows.append({
            "name": name,
            "total_count": total,
            "prev_total": prev_total,
            "delta_total": (total - prev_total) if prev_total is not None else None,
            "new_ads": len(new_ids),
            "dropped_ads": len(dropped_ids),
            "heat_score": heat_score,
            "oldest_active_ad_date": oldest["start_date"] if oldest else None,
        })

    rows.sort(key=lambda r: r["heat_score"], reverse=True)

    return {
        "date": today_data["date"],
        "prev_date": prev_data["date"] if prev_data else None,
        "rows": rows,
    }


if __name__ == "__main__":
    report = build_report()
    print(json.dumps(report, ensure_ascii=False, indent=2))

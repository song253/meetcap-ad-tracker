"""
data/snapshots/*.json 전체 히스토리를 모아서 웹 대시보드용 docs/data.json 을 만든다.
GitHub Pages는 정적 파일만 서빙하므로, 필요한 가공은 전부 여기서 미리 끝내둔다.
"""
import json
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
DOCS_DIR = ROOT / "docs"

NEW_AD_WEIGHT = 3


def tier_for_rank(rank: int, total: int) -> str:
    """순위(0-indexed, heat_score 내림차순) 기준 상대 등급. 실제 지출액이 아니라 워치리스트 내 상대 화력."""
    pct = rank / max(total - 1, 1)
    if pct <= 0.15:
        return "S"
    if pct <= 0.4:
        return "A"
    if pct <= 0.75:
        return "B"
    return "C"


def main():
    files = sorted(SNAPSHOT_DIR.glob("*.json"))
    if not files:
        raise SystemExit("스냅샷이 없습니다.")

    snapshots = [json.loads(f.read_text(encoding="utf-8")) for f in files]
    latest = snapshots[-1]
    prev = snapshots[-2] if len(snapshots) >= 2 else None
    prev_by_name = {b["name"]: b for b in prev["brands"]} if prev else {}

    history_by_name = {}
    for snap in snapshots:
        for b in snap["brands"]:
            history_by_name.setdefault(b["name"], []).append({
                "date": snap["date"],
                "total_count": b.get("total_count") or 0,
            })

    brand_rows = []
    all_ads = []  # 전체 피드용 (브랜드 태그 포함)
    new_today_ads = []
    hall_of_fame_candidates = []

    for b in latest["brands"]:
        name = b["name"]
        total = b.get("total_count") or 0
        ads = b.get("ads", [])
        today_ids = {a["library_id"] for a in ads}

        prev_b = prev_by_name.get(name)
        prev_ids = {a["library_id"] for a in prev_b.get("ads", [])} if prev_b else set()
        prev_total = (prev_b.get("total_count") or 0) if prev_b else None
        new_ids = today_ids - prev_ids if prev_b else set()

        heat_score = total + NEW_AD_WEIGHT * len(new_ids)

        video_n = sum(1 for a in ads if a.get("media_type") == "video")
        image_n = sum(1 for a in ads if a.get("media_type") == "image")

        dated = [a for a in ads if a.get("start_date")]
        oldest = min(dated, key=lambda a: a["start_date"]) if dated else None

        for a in ads:
            enriched = {**a, "brand": name}
            all_ads.append(enriched)
            if a["library_id"] in new_ids:
                new_today_ads.append(enriched)
            if a.get("start_date"):
                hall_of_fame_candidates.append(enriched)

        brand_rows.append({
            "name": name,
            "total_count": total,
            "prev_total": prev_total,
            "delta_total": (total - prev_total) if prev_total is not None else None,
            "new_ads": len(new_ids),
            "heat_score": heat_score,
            "video_count": video_n,
            "image_count": image_n,
            "oldest_active_ad": oldest,
            "history": history_by_name[name][-30:],  # 최근 30일치만
        })

    brand_rows.sort(key=lambda r: r["heat_score"], reverse=True)
    for i, r in enumerate(brand_rows):
        r["tier"] = tier_for_rank(i, len(brand_rows))

    # 피드는 최신 소재 우선 정렬
    all_ads.sort(key=lambda a: a.get("start_date") or "", reverse=True)
    new_today_ads.sort(key=lambda a: a.get("start_date") or "", reverse=True)

    # 명예의 전당: 가장 오래 살아남은(=검증된 승자) 소재 TOP 10
    hall_of_fame_candidates.sort(key=lambda a: a["start_date"])
    hall_of_fame = hall_of_fame_candidates[:10]

    out = {
        "generated_from_date": latest["date"],
        "prev_date": prev["date"] if prev else None,
        "brands": brand_rows,
        "feed_all": all_ads[:300],
        "feed_new_today": new_today_ads,
        "hall_of_fame": hall_of_fame,
    }

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    (DOCS_DIR / "data.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"대시보드 데이터 생성 완료: {DOCS_DIR / 'data.json'}  "
          f"(브랜드 {len(brand_rows)}개, 전체피드 {len(out['feed_all'])}개, "
          f"오늘신규 {len(new_today_ads)}개, 명예의전당 {len(hall_of_fame)}개)")


if __name__ == "__main__":
    main()

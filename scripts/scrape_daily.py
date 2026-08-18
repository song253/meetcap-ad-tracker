"""
Meta 광고 라이브러리 공개 웹 검색을 매일 순회해서 브랜드별 현재 활성 광고 스냅샷을 저장한다.
공식 API를 쓰지 않는 이유: 한국(비-EU/영국) 상업광고는 공식 ads_archive API가 아예 데이터를 안 줌.
공개 웹 페이지(facebook.com/ads/library)는 로그인/API 키 없이 동일 데이터를 보여주므로 이걸 그대로 자동화한다.

각 광고 카드에서 video/image src까지 추출해서 대시보드에서 바로 재생/미리보기가 가능하게 한다.
단, fbcdn 미디어 URL은 서명된 URL이라 며칠 지나면 만료될 수 있음 — 대시보드 쪽에서 로드 실패 시
메타 원본 링크(permalink)로 폴백한다.
"""
import json
import random
import re
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
WATCHLIST_PATH = ROOT / "data" / "watchlist.json"
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
EXTRACT_JS_PATH = Path(__file__).resolve().parent / "extract.js"

KST = timezone(timedelta(hours=9))

RESULT_COUNT_RE = re.compile(r"결과\s*~?\s*(\d+)\s*개")
NO_RESULT_MARK = "일치하는 광고가 없습니다"

EXTRACT_JS = EXTRACT_JS_PATH.read_text(encoding="utf-8")


def build_url(query: str) -> str:
    return (
        "https://www.facebook.com/ads/library/"
        "?active_status=active&ad_type=all&country=KR"
        f"&q={query}&search_type=keyword_unordered"
    )


def scrape_brand(page, query: str) -> dict:
    page.goto(build_url(query), wait_until="networkidle", timeout=45000)
    # 결과가 lazy-load 되므로 살짝 스크롤해서 앞쪽 소재들을 더 로드한다
    for _ in range(4):
        page.mouse.wheel(0, 2000)
        page.wait_for_timeout(600)

    text = page.inner_text("body")

    if NO_RESULT_MARK in text:
        return {"total_count": 0, "ads": []}

    count_match = RESULT_COUNT_RE.search(text)
    total_count = int(count_match.group(1)) if count_match else None

    raw_ads = page.evaluate(EXTRACT_JS)
    ads = []
    seen = set()
    for a in raw_ads:
        lib_id = a.get("id")
        if not lib_id or lib_id in seen:
            continue
        seen.add(lib_id)
        ads.append({
            "library_id": lib_id,
            "start_date": a.get("start_date"),
            "media_type": a.get("media_type"),
            "media_url": a.get("media_url"),
            "poster_url": a.get("poster"),
            "permalink": f"https://www.facebook.com/ads/library/?id={lib_id}",
        })

    return {"total_count": total_count, "ads": ads}


def main():
    watchlist = json.loads(WATCHLIST_PATH.read_text(encoding="utf-8"))["brands"]
    today = datetime.now(KST).strftime("%Y-%m-%d")

    results = {"date": today, "brands": []}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(locale="ko-KR")
        page = context.new_page()

        for brand in watchlist:
            name = brand["name"]
            query = brand["search_query"]
            print(f"[{name}] 조회 중... (query={query})")
            try:
                data = scrape_brand(page, query)
            except Exception as e:
                print(f"  ! 실패: {e}")
                data = {"total_count": None, "ads": [], "error": str(e)}

            results["brands"].append({
                "name": name,
                "search_query": query,
                "page_handle_or_id": brand.get("page_handle_or_id"),
                **data,
            })
            print(f"  -> 활성 광고 {data.get('total_count')}개, 수집된 소재 {len(data.get('ads', []))}개")

            # 과도한 연속 요청 방지 (예의상 텀 + 차단 방지)
            time.sleep(random.uniform(2.5, 5.0))

        browser.close()

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = SNAPSHOT_DIR / f"{today}.json"
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n스냅샷 저장 완료: {out_path}")


if __name__ == "__main__":
    main()

"""
heat_score 리포트를 디스코드 웹훅으로 전송한다.
웹훅 URL은 코드에 박아넣지 않고 환경변수 DISCORD_WEBHOOK_URL로 받는다.
"""
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from heat_score import build_report  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

TOP_N = 10


def format_message(report: dict) -> dict:
    date = report["date"]
    prev_date = report["prev_date"]
    rows = report["rows"]

    if not prev_date:
        header = f"📊 **미트캡 광고 화력 리포트 - {date}**\n(오늘부터 관찰 시작 — 내일부터 전일 대비 변화가 표시됩니다)"
    else:
        header = f"🔥 **미트캡 광고 화력 리포트 - {date}** (전일 {prev_date} 대비)"

    lines = [header, ""]

    lines.append(f"**TOP {TOP_N} (화력 지수 기준)**")
    for i, r in enumerate(rows[:TOP_N], 1):
        delta = r["delta_total"]
        if delta is None:
            delta_str = ""
        elif delta > 0:
            delta_str = f" (+{delta})"
        elif delta < 0:
            delta_str = f" ({delta})"
        else:
            delta_str = " (변동없음)"

        new_flag = f" 🆕신규{r['new_ads']}" if r["new_ads"] else ""
        lines.append(f"{i}. **{r['name']}** — 활성 {r['total_count']}개{delta_str}{new_flag}")

    # 오늘 신규 소재가 특히 많이 늘어난 브랜드 (2개 이상)
    surge = [r for r in rows if r["new_ads"] >= 2]
    if surge:
        lines.append("")
        lines.append("**🆕 오늘 신규 소재 급증**")
        for r in sorted(surge, key=lambda r: r["new_ads"], reverse=True)[:5]:
            lines.append(f"- {r['name']}: 신규 {r['new_ads']}개 (총 {r['total_count']}개)")

    content = "\n".join(lines)
    return {"content": content}


def send(webhook_url: str, payload: dict):
    resp = requests.post(webhook_url, json=payload, timeout=15)
    resp.raise_for_status()


def main():
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        raise SystemExit("환경변수 DISCORD_WEBHOOK_URL 이 설정되어 있지 않습니다.")

    report = build_report()
    payload = format_message(report)
    send(webhook_url, payload)
    print("디스코드 전송 완료")


if __name__ == "__main__":
    main()

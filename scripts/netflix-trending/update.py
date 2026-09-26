#!/usr/bin/env python3
"""Netflix trending data pipeline.

Downloads Netflix's weekly Top 10 dataset (all-weeks-countries.tsv), keeps
only the latest week, and writes one compact JSON per country to
<output_dir>/netflix/<iso2>.json so the app can fetch KBs instead of the
full 32MB TSV.

Usage:
    python3 scripts/netflix-trending/update.py <output_dir>

Stdlib only (urllib / csv / json / os).
"""

import csv
import io
import json
import os
import sys
import urllib.request

TSV_URL = "https://top10.netflix.com/data/all-weeks-countries.tsv"

# Expected header (verified against the real file, but resolved by name at
# parse time so column order doesn't matter).
EXPECTED_HEADER = [
    "country_name",
    "country_iso2",
    "week",
    "category",
    "weekly_rank",
    "show_title",
    "season_title",
    "cumulative_weeks_in_top_10",
]


def fetch_tsv():
    # MUST start from top10.netflix.com — it 301s to www.netflix.com/tudum/...,
    # and fetching the www URL directly 302s to a NotFound page. urllib
    # follows redirects by default, which handles the 301 hop.
    req = urllib.request.Request(TSV_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    return data.decode("utf-8", errors="replace")


def categorize(category):
    if category.startswith("Films"):
        return "films"
    if category.startswith("TV"):
        return "tv"
    return None


def build(text):
    reader = csv.reader(io.StringIO(text), delimiter="\t")
    header = next(reader)
    missing = [c for c in EXPECTED_HEADER if c not in header]
    if missing:
        raise SystemExit(f"TSV header changed — missing columns: {missing} (got: {header})")
    idx = {c: header.index(c) for c in EXPECTED_HEADER}

    rows = []
    max_week = None
    for r in reader:
        if len(r) <= max(idx.values()):
            continue
        week = r[idx["week"]]
        if max_week is None or week > max_week:
            max_week = week
        rows.append(r)

    countries = {}
    country_names = {}
    for r in rows:
        if r[idx["week"]] != max_week:
            continue
        cc = r[idx["country_iso2"]].upper()
        kind = categorize(r[idx["category"]])
        if not cc or kind is None:
            continue
        try:
            rank = int(r[idx["weekly_rank"]])
        except ValueError:
            continue
        entry = {
            "rank": rank,
            "title": r[idx["show_title"]],
            "weeks_in_top_10": int(r[idx["cumulative_weeks_in_top_10"]] or 0),
        }
        if kind == "tv":
            season = r[idx["season_title"]]
            if season and season != "N/A":
                entry["season"] = season
        countries.setdefault(cc, []).append((kind, entry))
        country_names.setdefault(cc, r[idx["country_name"]])

    out = {}
    for cc, items in countries.items():
        films = sorted([e for k, e in items if k == "films"], key=lambda e: e["rank"])
        tv = sorted([e for k, e in items if k == "tv"], key=lambda e: e["rank"])
        out[cc] = {
            "week": max_week,
            "country_iso2": cc,
            "country_name": country_names.get(cc, ""),
            "films": films,
            "tv": tv,
        }
    return out


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 scripts/netflix-trending/update.py <output_dir>")
    output_dir = sys.argv[1]
    netflix_dir = os.path.join(output_dir, "netflix")
    os.makedirs(netflix_dir, exist_ok=True)

    countries = build(fetch_tsv())
    for cc, payload in countries.items():
        path = os.path.join(netflix_dir, f"{cc.lower()}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {len(countries)} countries")


if __name__ == "__main__":
    main()

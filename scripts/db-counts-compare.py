#!/usr/bin/env python3
"""Compare record counts between the managed PostgreSQL DB (.env DATABASE_URL)
and the packaged SQLite volume (db/custom.db). Read-only diagnostic."""
import os
import sqlite3
import sys

import psycopg2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABLES = [
    "User", "GuestHouse", "Industry", "HealthCenter", "EducationCenter",
    "AgricultureCenter", "SmallEnterprise", "CharityInitiative", "Goal",
    "SubCity", "SubCityArea", "IndustryCategory", "Survey", "SurveyResponse",
]


def load_pg_url():
    for line in open(os.path.join(ROOT, ".env")):
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip()
    return os.environ.get("DATABASE_URL")


def mask(url):
    import re
    return re.sub(r"(://[^:]+:)[^@]+@", r"\1***@", url)


def main():
    pg_url = load_pg_url()
    pg = psycopg2.connect(pg_url)
    pg_cur = pg.cursor()

    lite = sqlite3.connect(os.path.join(ROOT, "db", "custom.db"))
    lite_cur = lite.cursor()

    print(f"Postgres: {mask(pg_url)}")
    print(f"{'table':<22}{'postgres':>10}{'sqlite':>10}")
    for t in TABLES:
        pg_n = "-"
        try:
            pg_cur.execute(f'SELECT COUNT(*) FROM "{t}"')
            pg_n = pg_cur.fetchone()[0]
        except Exception as e:
            pg_cur.execute("ROLLBACK")
            pg_n = f"ERR:{type(e).__name__}"
        try:
            lite_cur.execute(f'SELECT COUNT(*) FROM "{t}"')
            lite_n = lite_cur.fetchone()[0]
        except Exception:
            lite_n = "-"
        print(f"{t:<22}{str(pg_n):>10}{str(lite_n):>10}")

    pg.close()
    lite.close()


if __name__ == "__main__":
    sys.exit(main())

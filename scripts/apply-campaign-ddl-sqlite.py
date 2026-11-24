#!/usr/bin/env python3
"""Apply the Donation Campaign module DDL to the packaged SQLite db
(db/custom.db) so db/schema-runtime.json covers the new tables.

The active Prisma provider is postgresql (platform-managed), so
`prisma db push` cannot target the packaged SQLite file directly; the DDL
below mirrors exactly what Prisma generates for the three new models.

Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
"""

import os
import sqlite3

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT, "db", "custom.db")

DDL = [
    """
    CREATE TABLE IF NOT EXISTS "DonationCampaign" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "totalGoal" REAL NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'ETB',
        "kindNote" TEXT,
        "startDate" DATETIME NOT NULL,
        "deadline" DATETIME NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "createdById" TEXT,
        "createdByName" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS "DonationCampaignAssignment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "campaignId" TEXT NOT NULL,
        "departmentId" TEXT NOT NULL,
        "minimumAmount" REAL NOT NULL,
        "note" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "DonationCampaignAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "DonationCampaignAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
    """,
    'CREATE UNIQUE INDEX IF NOT EXISTS "DonationCampaignAssignment_campaignId_departmentId_key" ON "DonationCampaignAssignment"("campaignId", "departmentId")',
    """
    CREATE TABLE IF NOT EXISTS "DonationEntry" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "campaignId" TEXT NOT NULL,
        "departmentId" TEXT NOT NULL,
        "reportDate" DATETIME NOT NULL,
        "cashAmount" REAL NOT NULL DEFAULT 0,
        "inKindValue" REAL NOT NULL DEFAULT 0,
        "inKindDetails" TEXT,
        "donorsCount" INTEGER NOT NULL DEFAULT 0,
        "notes" TEXT,
        "reportedById" TEXT,
        "reportedByName" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "DonationEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "DonationEntry_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
    """,
    'CREATE INDEX IF NOT EXISTS "DonationEntry_campaignId_departmentId_reportDate_idx" ON "DonationEntry"("campaignId", "departmentId", "reportDate")',
]


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        for stmt in DDL:
            conn.execute(stmt)
        conn.commit()
        names = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Donation%' ORDER BY name"
            )
        ]
        print("campaign tables present:", names)
    finally:
        conn.close()


if __name__ == "__main__":
    main()

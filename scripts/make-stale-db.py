#!/usr/bin/env python3
"""Build a STALE runtime DB simulation: only User (missing assignedArea) and
GuestHouse (missing hasWiFi) exist, with one row of user data each; all newer
tables (SmallEnterprise, Goal, Charity, SubCity...) absent — mirroring the
hypothesised deployed runtime database."""
import os
import sqlite3
import sys

# Use the REAL admin password hash from the preview database so the sim's
# login flow behaves exactly like production (a placeholder hash would make
# credentials.login fail and invalidate the authenticated sweep).
real_hash = None
try:
    rc = sqlite3.connect("/home/z/my-project/db/custom.db")
    row = rc.execute("SELECT password FROM User WHERE username='admin'").fetchone()
    rc.close()
    if row and row[0]:
        real_hash = row[0]
except Exception:
    pass
admin_hash = real_hash or "$2b$10$placeholderhashvalue0000000000000000000000000000"
if not real_hash:
    print("WARNING: no real admin hash available; login will fail", file=sys.stderr)

ROOT = "/tmp/stale-sim"
os.makedirs(f"{ROOT}/db", exist_ok=True)
dbp = f"{ROOT}/db/custom.db"
if os.path.exists(dbp):
    os.remove(dbp)

con = sqlite3.connect(dbp)
con.executescript(f"""
CREATE TABLE User (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT,
  name TEXT,
  role TEXT DEFAULT 'COLLECTOR',
  assignedSubCity TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME
);
CREATE TABLE GuestHouse (
  id TEXT PRIMARY KEY,
  guestHouseName TEXT,
  organizationName TEXT,
  subCity TEXT,
  area TEXT,
  specificAddress TEXT,
  numberOfRooms INTEGER,
  licenseType TEXT,
  licenseLevel TEXT,
  licenseNumber TEXT,
  serviceRating INTEGER,
  contactPhone TEXT,
  hasRestaurant BOOLEAN DEFAULT 0,
  hasParking BOOLEAN DEFAULT 0,
  hasHotWater BOOLEAN DEFAULT 0,
  additionalServices TEXT,
  surveyorName TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO User VALUES ('u1','admin','{admin_hash}','Administrator','ADMIN',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO GuestHouse (id,guestHouseName,organizationName,subCity,area,specificAddress,numberOfRooms,licenseType,licenseLevel,serviceRating,hasRestaurant,hasParking,hasHotWater)
 VALUES ('gh1','OLD TOWN LODGE','Old Town','Dukam','Odaa Nabee','main st',12,'Hotel','Level 1',4,1,0,1);
""")
con.commit()
con.close()
print("stale DB ready at", dbp)
import subprocess
print(subprocess.run(["python3", "-c", f"""
import sqlite3
con = sqlite3.connect('{dbp}')
print('tables:', [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")])
print('User cols:', [r[1] for r in con.execute('PRAGMA table_info(User)')])
"""], capture_output=True, text=True).stdout)

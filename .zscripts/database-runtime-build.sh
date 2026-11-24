#!/bin/bash

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/z/my-project}"
BUILD_DIR="${BUILD_DIR:?BUILD_DIR is required}"
SOURCE_DB_DIR="$PROJECT_DIR/db"
TARGET_DB_DIR="$BUILD_DIR/db"

# 本应用已迁移到平台托管 PostgreSQL：数据库结构与数据都在托管库中
# （构建期 npm run build 里的 prisma db push 负责同步 schema），SQLite
# 文件不再是数据源。这里仅原样携带 db/ 目录（历史脚本/排查用），不再
# 对打包库执行任何 prisma 操作。
mkdir -p "$TARGET_DB_DIR"
if [ -d "$SOURCE_DB_DIR" ]; then
    echo "🗄️  携带 db/ 目录到构建产物（非数据源，仅存档）..."
    cp -a "$SOURCE_DB_DIR/." "$TARGET_DB_DIR/"
else
    echo "ℹ️  未找到 db/ 目录，跳过"
fi

echo "✅ 构建产物数据库处理完成（PostgreSQL 由运行时 DATABASE_URL 指定）"

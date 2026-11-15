use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperRecord {
    pub id: String,
    pub issue: i64,
    pub title: String,
    pub english: String,
    pub prompt: String,
    pub model: String,
    pub aspect_ratio: String,
    pub resolution: String,
    pub image_path: String,
    pub created_at: i64,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("打开数据库失败:{e}"))?;
        conn.execute_batch(
            "
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS wallpapers (
                id TEXT PRIMARY KEY,
                issue INTEGER NOT NULL,
                title TEXT NOT NULL,
                english TEXT NOT NULL,
                prompt TEXT NOT NULL,
                model TEXT NOT NULL,
                aspect_ratio TEXT NOT NULL,
                resolution TEXT NOT NULL,
                image_path TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS favorites (
                id TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT OR IGNORE INTO meta (key, value) VALUES ('last_issue', 7);
            ",
        )
        .map_err(|e| format!("初始化数据库失败:{e}"))?;
        Ok(Self { conn })
    }

    /// Issues are globally increasing; the four bundled wallpapers end at 07.
    pub fn next_issue(&self) -> Result<i64, String> {
        self.conn
            .execute("UPDATE meta SET value = value + 1 WHERE key = 'last_issue'", [])
            .map_err(|e| format!("写入序号失败:{e}"))?;
        self.conn
            .query_row("SELECT value FROM meta WHERE key = 'last_issue'", [], |row| row.get(0))
            .map_err(|e| format!("读取序号失败:{e}"))
    }

    pub fn insert_wallpaper(&self, record: &WallpaperRecord) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO wallpapers (id, issue, title, english, prompt, model, aspect_ratio, resolution, image_path, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    record.id,
                    record.issue,
                    record.title,
                    record.english,
                    record.prompt,
                    record.model,
                    record.aspect_ratio,
                    record.resolution,
                    record.image_path,
                    record.created_at,
                ],
            )
            .map_err(|e| format!("保存作品记录失败:{e}"))?;
        Ok(())
    }

    pub fn list_wallpapers(&self) -> Result<Vec<WallpaperRecord>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, issue, title, english, prompt, model, aspect_ratio, resolution, image_path, created_at
                 FROM wallpapers ORDER BY issue DESC",
            )
            .map_err(|e| format!("读取作品失败:{e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(WallpaperRecord {
                    id: row.get(0)?,
                    issue: row.get(1)?,
                    title: row.get(2)?,
                    english: row.get(3)?,
                    prompt: row.get(4)?,
                    model: row.get(5)?,
                    aspect_ratio: row.get(6)?,
                    resolution: row.get(7)?,
                    image_path: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("读取作品失败:{e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取作品失败:{e}"))
    }

    pub fn list_favorites(&self) -> Result<Vec<String>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM favorites ORDER BY rowid")
            .map_err(|e| format!("读取收藏失败:{e}"))?;
        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("读取收藏失败:{e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取收藏失败:{e}"))
    }

    /// Returns true if the id is now a favorite.
    pub fn toggle_favorite(&self, id: &str) -> Result<bool, String> {
        let exists: bool = self
            .conn
            .query_row("SELECT EXISTS(SELECT 1 FROM favorites WHERE id = ?1)", params![id], |row| row.get(0))
            .map_err(|e| format!("读取收藏失败:{e}"))?;
        if exists {
            self.conn
                .execute("DELETE FROM favorites WHERE id = ?1", params![id])
                .map_err(|e| format!("更新收藏失败:{e}"))?;
            Ok(false)
        } else {
            self.conn
                .execute("INSERT INTO favorites (id) VALUES (?1)", params![id])
                .map_err(|e| format!("更新收藏失败:{e}"))?;
            Ok(true)
        }
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| format!("读取设置失败:{e}"))?;
        let mut rows = stmt
            .query(params![key])
            .map_err(|e| format!("读取设置失败:{e}"))?;
        if let Some(row) = rows.next().map_err(|e| format!("读取设置失败:{e}"))? {
            Ok(Some(row.get(0).map_err(|e| format!("读取设置失败:{e}"))?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
                params![key, value],
            )
            .map_err(|e| format!("写入设置失败:{e}"))?;
        Ok(())
    }
}

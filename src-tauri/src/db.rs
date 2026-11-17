use rusqlite::{params, Connection, OptionalExtension};
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
    pub folder: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRecord {
    pub id: String,
    pub name: String,
    pub count: i64,
}

pub struct Database {
    conn: Connection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRequest {
    pub request_id: String,
    pub model: String,
    pub prompt: String,
    pub style_name: String,
    pub resolution: String,
    pub aspect_ratio: String,
    pub created_at: i64,
}

fn map_wallpaper(row: &rusqlite::Row<'_>) -> rusqlite::Result<WallpaperRecord> {
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
        folder: row.get(9)?,
        created_at: row.get(10)?,
    })
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
            CREATE TABLE IF NOT EXISTS pending_requests (
                request_id TEXT PRIMARY KEY,
                model TEXT NOT NULL,
                prompt TEXT NOT NULL,
                style_name TEXT NOT NULL,
                resolution TEXT NOT NULL,
                aspect_ratio TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            INSERT OR IGNORE INTO meta (key, value) VALUES ('last_issue', 7);
            ",
        )
        .map_err(|e| format!("初始化数据库失败:{e}"))?;
        // 旧库补列：图片所属文件夹（空串 = 存储根目录）
        let _ = conn.execute("ALTER TABLE wallpapers ADD COLUMN folder TEXT NOT NULL DEFAULT ''", []);
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
                "INSERT INTO wallpapers (id, issue, title, english, prompt, model, aspect_ratio, resolution, image_path, folder, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
                    record.folder,
                    record.created_at,
                ],
            )
            .map_err(|e| format!("保存作品记录失败:{e}"))?;
        Ok(())
    }

    pub fn insert_wallpaper_ignore(&self, record: &WallpaperRecord) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR IGNORE INTO wallpapers (id, issue, title, english, prompt, model, aspect_ratio, resolution, image_path, folder, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
                    record.folder,
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
                "SELECT id, issue, title, english, prompt, model, aspect_ratio, resolution, image_path, folder, created_at
                 FROM wallpapers ORDER BY issue DESC",
            )
            .map_err(|e| format!("读取作品失败:{e}"))?;
        let rows = stmt
            .query_map([], map_wallpaper)
            .map_err(|e| format!("读取作品失败:{e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取作品失败:{e}"))
    }

    pub fn get_wallpaper(&self, id: &str) -> Result<Option<WallpaperRecord>, String> {
        self.conn
            .query_row(
                "SELECT id, issue, title, english, prompt, model, aspect_ratio, resolution, image_path, folder, created_at
                 FROM wallpapers WHERE id = ?1",
                params![id],
                map_wallpaper,
            )
            .optional()
            .map_err(|error| format!("读取作品失败:{error}"))
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

    pub fn insert_pending(&self, pending: &PendingRequest) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO pending_requests (request_id, model, prompt, style_name, resolution, aspect_ratio, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    pending.request_id,
                    pending.model,
                    pending.prompt,
                    pending.style_name,
                    pending.resolution,
                    pending.aspect_ratio,
                    pending.created_at,
                ],
            )
            .map_err(|e| format!("写入待取回请求失败:{e}"))?;
        Ok(())
    }

    pub fn delete_pending(&self, request_id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM pending_requests WHERE request_id = ?1", params![request_id])
            .map_err(|e| format!("删除待取回请求失败:{e}"))?;
        Ok(())
    }

    pub fn list_pendings(&self) -> Result<Vec<PendingRequest>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT request_id, model, prompt, style_name, resolution, aspect_ratio, created_at
                 FROM pending_requests ORDER BY created_at",
            )
            .map_err(|e| format!("读取待取回请求失败:{e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(PendingRequest {
                    request_id: row.get(0)?,
                    model: row.get(1)?,
                    prompt: row.get(2)?,
                    style_name: row.get(3)?,
                    resolution: row.get(4)?,
                    aspect_ratio: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("读取待取回请求失败:{e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取待取回请求失败:{e}"))
    }

    pub fn get_wallpaper_path(&self, id: &str) -> Option<String> {
        self.conn
            .query_row("SELECT image_path FROM wallpapers WHERE id = ?1", params![id], |row| row.get(0))
            .ok()
    }

    /// Deletes records and their favorite entries; returns rows removed.
    pub fn delete_wallpapers(&self, ids: &[String]) -> Result<u32, String> {
        let tx = self.conn.unchecked_transaction().map_err(|e| format!("删除记录失败:{e}"))?;
        let mut count = 0u32;
        for id in ids {
            let removed = tx
                .execute("DELETE FROM wallpapers WHERE id = ?1", params![id])
                .map_err(|e| format!("删除记录失败:{e}"))?;
            let _ = tx.execute("DELETE FROM favorites WHERE id = ?1", params![id]);
            if removed > 0 {
                count += 1;
            }
        }
        tx.commit().map_err(|e| format!("删除记录失败:{e}"))?;
        Ok(count)
    }

    pub fn list_folders(&self) -> Result<Vec<FolderRecord>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT f.id, f.name, COUNT(w.id) AS count
                 FROM folders f LEFT JOIN wallpapers w ON w.folder = f.id
                 GROUP BY f.id ORDER BY f.created_at",
            )
            .map_err(|e| format!("读取文件夹失败:{e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(FolderRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    count: row.get(2)?,
                })
            })
            .map_err(|e| format!("读取文件夹失败:{e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取文件夹失败:{e}"))
    }

    pub fn create_folder(&self, id: &str, name: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR IGNORE INTO folders (id, name, created_at) VALUES (?1, ?2, ?3)",
                params![id, name, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)],
            )
            .map_err(|e| format!("创建文件夹失败:{e}"))?;
        Ok(())
    }

    pub fn delete_folder(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM folders WHERE id = ?1", params![id])
            .map_err(|e| format!("删除文件夹失败:{e}"))?;
        Ok(())
    }

    pub fn set_wallpaper_folder(&self, wallpaper_id: &str, folder: &str, new_path: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE wallpapers SET folder = ?1, image_path = ?2 WHERE id = ?3",
                params![folder, new_path, wallpaper_id],
            )
            .map_err(|e| format!("移动图片失败:{e}"))?;
        Ok(())
    }
}

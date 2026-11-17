use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

/// Single path segment safe to join under the storage root.
/// Unicode letters are allowed so existing folders named in Chinese keep working.
/// Separators, drive prefixes and `..` are rejected before any join.
pub fn require_safe_folder_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 120 {
        return Err("文件夹无效".into());
    }
    if id.chars().any(|ch| matches!(ch, '/' | '\\' | ':' | '\0') || ch.is_control()) {
        return Err("文件夹无效".into());
    }
    if id == "." || id == ".." || id.contains("..") {
        return Err("文件夹无效".into());
    }
    Ok(())
}

pub fn is_image_filename(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()).as_deref(),
        Some("png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp")
    )
}

/// Parent directory of a recorded wallpaper, when it is safe to treat as a storage root.
/// Rejects `..` and filesystem roots so a poisoned database path cannot widen access to `/` or `C:\`.
pub fn usable_image_parent(image_path: &Path) -> Option<PathBuf> {
    if image_path.as_os_str().is_empty() || image_path.components().any(|component| matches!(component, Component::ParentDir)) {
        return None;
    }
    if !is_image_filename(image_path) {
        return None;
    }
    let parent = image_path.parent()?;
    if parent.as_os_str().is_empty() || !parent.is_dir() || is_filesystem_root(parent) {
        return None;
    }
    Some(parent.to_path_buf())
}

pub fn is_filesystem_root(path: &Path) -> bool {
    let canon = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    canon.parent().is_none()
}

/// Resolve `candidate` and require the real path to stay inside `root`.
/// Symlinks are followed. `..`, missing roots and paths outside `root` fail.
pub fn resolve_inside(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let root_canon = root.canonicalize().map_err(|error| format!("存储目录不可用:{error}"))?;
    if candidate.as_os_str().is_empty() || candidate.components().any(|component| matches!(component, Component::ParentDir)) {
        return Err("路径超出存储目录".into());
    }
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root_canon.join(candidate)
    };
    if joined.exists() {
        let canon = joined.canonicalize().map_err(|error| format!("路径无效:{error}"))?;
        return if canon.starts_with(&root_canon) {
            Ok(canon)
        } else {
            Err("路径超出存储目录".into())
        };
    }
    let mut suffix: Vec<String> = Vec::new();
    let mut cursor = joined.as_path();
    loop {
        if cursor.exists() {
            let base = cursor.canonicalize().map_err(|error| format!("路径无效:{error}"))?;
            if !base.starts_with(&root_canon) {
                return Err("路径超出存储目录".into());
            }
            let mut out = base;
            for part in suffix.iter().rev() {
                if part.is_empty() || part == "." || part == ".." {
                    return Err("路径超出存储目录".into());
                }
                out.push(part);
            }
            return if out.starts_with(&root_canon) {
                Ok(out)
            } else {
                Err("路径超出存储目录".into())
            };
        }
        let Some(name) = cursor.file_name() else {
            return Err("路径超出存储目录".into());
        };
        suffix.push(name.to_string_lossy().into_owned());
        let Some(parent) = cursor.parent() else {
            return Err("路径超出存储目录".into());
        };
        if parent.as_os_str().is_empty() {
            return Err("路径超出存储目录".into());
        }
        cursor = parent;
    }
}

pub fn resolve_inside_any(roots: &[PathBuf], candidate: &Path) -> Result<PathBuf, String> {
    let mut last = "路径超出存储目录".to_string();
    for root in roots {
        if !root.exists() {
            continue;
        }
        match resolve_inside(root, candidate) {
            Ok(path) => return Ok(path),
            Err(error) => last = error,
        }
    }
    Err(last)
}

/// `root/folders/{id}` after the id and the resolved path are both checked.
pub fn folder_dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    require_safe_folder_id(id)?;
    resolve_inside(root, &root.join("folders").join(id))
}

/// Rename, or copy without overwriting when the destination is on another volume.
/// An existing target is left untouched.
pub fn move_file(source: &Path, target: &Path) -> Result<(), String> {
    if source == target {
        return Ok(());
    }
    if target.exists() {
        return Err("目标位置已有同名文件".into());
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("准备目标目录失败:{error}"))?;
    }
    if std::fs::rename(source, target).is_ok() {
        return Ok(());
    }
    let mut input = std::fs::File::open(source).map_err(|error| format!("读取源文件失败:{error}"))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| format!("写入目标文件失败:{error}"))?;
    if let Err(error) = io::copy(&mut input, &mut output) {
        let _ = std::fs::remove_file(target);
        return Err(format!("复制文件失败:{error}"));
    }
    output.flush().map_err(|error| format!("写入目标文件失败:{error}"))?;
    std::fs::remove_file(source).map_err(|error| format!("移除源文件失败:{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch(label: &str) -> PathBuf {
        static N: AtomicU64 = AtomicU64::new(0);
        let tick = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "burn-paths-{label}-{}-{}-{}",
            std::process::id(),
            tick,
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn folder_ids_reject_traversal_and_absolute_forms() {
        assert!(require_safe_folder_id("雨夜").is_ok());
        assert!(require_safe_folder_id("wolf-01").is_ok());
        for id in ["", ".", "..", "../x", r"..\x", r"C:\Windows", "/etc", "a/b", "a\\b", "con:aux"] {
            assert!(require_safe_folder_id(id).is_err(), "{id}");
        }
    }

    #[test]
    fn resolve_rejects_parent_absolute_and_prefix_sibling() {
        let root = scratch("root");
        std::fs::create_dir_all(root.join("folders")).unwrap();
        std::fs::write(root.join("folders").join("ok.png"), b"ok").unwrap();
        let resolved = resolve_inside(&root, &root.join("folders").join("ok.png")).unwrap();
        assert!(resolved.starts_with(root.canonicalize().unwrap()));
        assert!(resolved.ends_with("ok.png"));

        assert!(resolve_inside(&root, &root.join("folders").join("..").join("..").join("etc")).is_err());
        assert!(resolve_inside(&root, Path::new("/etc/passwd")).is_err());

        let sibling = scratch("sibling");
        std::fs::write(sibling.join("note.txt"), b"x").unwrap();
        assert!(resolve_inside(&root, &sibling.join("note.txt")).is_err());
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&sibling);
    }

    #[test]
    fn non_existing_child_stays_inside_root() {
        let root = scratch("dest");
        let pending = resolve_inside(&root, &root.join("folders").join("雨夜").join("gen.png")).unwrap();
        assert!(pending.starts_with(root.canonicalize().unwrap()));
        assert!(pending.ends_with("gen.png"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn symlink_pointing_outside_is_rejected() {
        let root = scratch("link-root");
        let outside = scratch("link-out");
        std::fs::write(outside.join("secret.txt"), b"secret").unwrap();
        std::os::unix::fs::symlink(outside.join("secret.txt"), root.join("leak")).unwrap();
        assert!(resolve_inside(&root, &root.join("leak")).is_err());
        assert_eq!(std::fs::read(outside.join("secret.txt")).unwrap(), b"secret");
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn move_file_does_not_overwrite() {
        let root = scratch("move");
        std::fs::write(root.join("a.bin"), b"aaa").unwrap();
        std::fs::write(root.join("b.bin"), b"bbb").unwrap();
        assert!(move_file(&root.join("a.bin"), &root.join("b.bin")).is_err());
        assert_eq!(std::fs::read(root.join("a.bin")).unwrap(), b"aaa");
        assert_eq!(std::fs::read(root.join("b.bin")).unwrap(), b"bbb");
        move_file(&root.join("a.bin"), &root.join("c.bin")).unwrap();
        assert!(!root.join("a.bin").exists());
        assert_eq!(std::fs::read(root.join("c.bin")).unwrap(), b"aaa");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn recorded_image_parent_is_a_storage_root_but_traversal_is_not() {
        let root = scratch("library");
        let image = root.join("gen-1.png");
        std::fs::write(&image, b"png").unwrap();
        assert_eq!(usable_image_parent(&image).unwrap(), root);
        assert!(usable_image_parent(&root.join("note.txt")).is_none());
        assert!(usable_image_parent(&root.join("..").join("gen-1.png")).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn filesystem_root_is_recognized() {
        assert!(is_filesystem_root(Path::new("/")));
        let root = scratch("not-root");
        assert!(!is_filesystem_root(&root));
        let _ = std::fs::remove_dir_all(&root);
    }
}

use std::{
    collections::{BTreeSet, HashMap},
    fs,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::image_dimensions;
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
struct ImageSize {
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum CompareStatus {
    Match,
    SizeMismatch,
    MissingLeft,
    MissingRight,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CompareResult {
    file_name: String,
    left_path: Option<String>,
    right_path: Option<String>,
    left_size: Option<ImageSize>,
    right_size: Option<ImageSize>,
    left_error: Option<String>,
    right_error: Option<String>,
    status: CompareStatus,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImagePreview {
    data_url: String,
}

#[tauri::command]
async fn select_folder(app: AppHandle) -> Result<Option<String>, String> {
    let folder = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|path| path.into_path())
        .transpose()
        .map_err(|err| err.to_string())?;

    Ok(folder.map(path_to_string))
}

#[tauri::command]
fn normalize_folder_path(path: String) -> Result<String, String> {
    let normalized = normalize_directory(&path)?;
    Ok(path_to_string(normalized))
}

#[tauri::command]
fn compare_image_folders(
    left_path: String,
    right_path: String,
) -> Result<Vec<CompareResult>, String> {
    let left_dir = normalize_directory(&left_path)?;
    let right_dir = normalize_directory(&right_path)?;

    let left_images = scan_images(&left_dir)?;
    let right_images = scan_images(&right_dir)?;

    let file_names = left_images
        .keys()
        .chain(right_images.keys())
        .cloned()
        .collect::<BTreeSet<_>>();

    let mut results = Vec::with_capacity(file_names.len());

    for file_name in file_names {
        let left_file = left_images.get(&file_name).cloned();
        let right_file = right_images.get(&file_name).cloned();

        let (left_size, left_error) = read_dimensions_safe(left_file.as_deref());
        let (right_size, right_error) = read_dimensions_safe(right_file.as_deref());

        let (status, message) = build_status_and_message(
            &file_name,
            left_size.as_ref(),
            right_size.as_ref(),
            left_error.as_deref(),
            right_error.as_deref(),
        );

        results.push(CompareResult {
            file_name,
            left_path: left_file.map(path_to_string),
            right_path: right_file.map(path_to_string),
            left_size,
            right_size,
            left_error,
            right_error,
            status,
            message,
        });
    }

    Ok(results)
}

#[tauri::command]
fn load_image_preview(path: String) -> Result<ImagePreview, String> {
    let image_path = PathBuf::from(path);
    if !image_path.is_file() {
        return Err("图片文件不存在".to_string());
    }

    let mime_type =
        mime_type_for_path(&image_path).ok_or_else(|| "当前图片格式不支持预览".to_string())?;
    let bytes = fs::read(&image_path).map_err(|err| format!("读取图片失败：{err}"))?;

    Ok(ImagePreview {
        data_url: format!("data:{mime_type};base64,{}", BASE64.encode(bytes)),
    })
}

fn normalize_directory(path: &str) -> Result<PathBuf, String> {
    let directory = PathBuf::from(path);
    if !directory.exists() {
        return Err(format!("目录不存在：{path}"));
    }
    if !directory.is_dir() {
        return Err(format!("路径不是目录：{path}"));
    }
    directory
        .canonicalize()
        .map_err(|err| format!("无法解析目录路径 {path}：{err}"))
}

fn scan_images(directory: &Path) -> Result<HashMap<String, PathBuf>, String> {
    let mut images = HashMap::new();
    let entries = fs::read_dir(directory)
        .map_err(|err| format!("读取目录失败 {}：{err}", directory.display()))?;

    for entry in entries {
        let entry = entry.map_err(|err| format!("遍历目录失败 {}：{err}", directory.display()))?;
        let path = entry.path();

        if !path.is_file() || !is_supported_image(&path) {
            continue;
        }

        if let Some(file_name) = path.file_name().and_then(|name| name.to_str()) {
            images.insert(file_name.to_string(), path);
        }
    }

    Ok(images)
}

fn is_supported_image(path: &Path) -> bool {
    matches!(
      path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()),
      Some(ext) if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp" | "gif")
    )
}

fn read_dimensions(path: &Path) -> Result<ImageSize, String> {
    let (width, height) = image_dimensions(path)
        .map_err(|err| format!("读取图片尺寸失败 {}：{err}", path.display()))?;

    Ok(ImageSize { width, height })
}

fn read_dimensions_safe(path: Option<&Path>) -> (Option<ImageSize>, Option<String>) {
    match path {
        Some(path) => match read_dimensions(path) {
            Ok(size) => (Some(size), None),
            Err(error) => (None, Some(error)),
        },
        None => (None, None),
    }
}

fn build_status_and_message(
    file_name: &str,
    left_size: Option<&ImageSize>,
    right_size: Option<&ImageSize>,
    left_error: Option<&str>,
    right_error: Option<&str>,
) -> (CompareStatus, String) {
    if let (Some(left), Some(right)) = (left_error, right_error) {
        return (
            CompareStatus::SizeMismatch,
            format!("{file_name} 在文件夹 A/B 均无法读取尺寸：A: {left}; B: {right}"),
        );
    }

    if let Some(error) = left_error {
        return (
            CompareStatus::SizeMismatch,
            format!("{file_name} 在文件夹 A 无法读取尺寸：{error}"),
        );
    }

    if let Some(error) = right_error {
        return (
            CompareStatus::SizeMismatch,
            format!("{file_name} 在文件夹 B 无法读取尺寸：{error}"),
        );
    }

    match (left_size, right_size) {
        (Some(left), Some(right)) if left == right => (
            CompareStatus::Match,
            format!("{file_name} 尺寸一致：{} x {}", left.width, left.height),
        ),
        (Some(left), Some(right)) => (
            CompareStatus::SizeMismatch,
            format!(
                "{file_name} 尺寸不一致：A 为 {} x {}，B 为 {} x {}",
                left.width, left.height, right.width, right.height
            ),
        ),
        (Some(_), None) => (
            CompareStatus::MissingRight,
            format!("{file_name} 仅存在于文件夹 A，文件夹 B 缺失"),
        ),
        (None, Some(_)) => (
            CompareStatus::MissingLeft,
            format!("{file_name} 仅存在于文件夹 B，文件夹 A 缺失"),
        ),
        (None, None) => (
            CompareStatus::SizeMismatch,
            format!("{file_name} 未能读取到可比较的图片"),
        ),
    }
}

fn mime_type_for_path(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_folder,
            normalize_folder_path,
            compare_image_folders,
            load_image_preview
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};
    use tempfile::tempdir;

    fn write_png(path: &Path, width: u32, height: u32) {
        let image =
            ImageBuffer::<Rgba<u8>, Vec<u8>>::from_pixel(width, height, Rgba([0, 0, 0, 255]));
        image.save(path).expect("failed to save test image");
    }

    #[test]
    fn ignores_non_images_and_matches_same_named_files() {
        let left = tempdir().expect("left tempdir");
        let right = tempdir().expect("right tempdir");

        write_png(&left.path().join("same.png"), 100, 200);
        write_png(&right.path().join("same.png"), 100, 200);
        fs::write(left.path().join("notes.txt"), "ignore me").expect("write non-image");

        let results = compare_image_folders(
            left.path().to_string_lossy().into_owned(),
            right.path().to_string_lossy().into_owned(),
        )
        .expect("compare success");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, CompareStatus::Match);
        assert_eq!(results[0].file_name, "same.png");
    }

    #[test]
    fn reports_size_mismatch_and_missing_files() {
        let left = tempdir().expect("left tempdir");
        let right = tempdir().expect("right tempdir");

        write_png(&left.path().join("diff.png"), 120, 200);
        write_png(&right.path().join("diff.png"), 120, 240);
        write_png(&left.path().join("left-only.png"), 60, 60);
        write_png(&right.path().join("right-only.png"), 80, 80);

        let results = compare_image_folders(
            left.path().to_string_lossy().into_owned(),
            right.path().to_string_lossy().into_owned(),
        )
        .expect("compare success");

        assert_eq!(results.len(), 3);
        assert!(
            results
                .iter()
                .any(|item| item.file_name == "diff.png"
                    && item.status == CompareStatus::SizeMismatch)
        );
        assert!(results
            .iter()
            .any(|item| item.file_name == "left-only.png"
                && item.status == CompareStatus::MissingRight));
        assert!(results
            .iter()
            .any(|item| item.file_name == "right-only.png"
                && item.status == CompareStatus::MissingLeft));
    }

    #[test]
    fn reports_invalid_images_without_aborting_compare() {
        let left = tempdir().expect("left tempdir");
        let right = tempdir().expect("right tempdir");

        fs::write(left.path().join("broken.png"), b"not a png").expect("write broken png");
        write_png(&right.path().join("broken.png"), 30, 30);
        write_png(&left.path().join("ok.png"), 20, 20);
        write_png(&right.path().join("ok.png"), 20, 20);

        let results = compare_image_folders(
            left.path().to_string_lossy().into_owned(),
            right.path().to_string_lossy().into_owned(),
        )
        .expect("compare success");

        assert_eq!(results.len(), 2);
        let broken = results
            .iter()
            .find(|item| item.file_name == "broken.png")
            .expect("broken result exists");
        assert_eq!(broken.status, CompareStatus::SizeMismatch);
        assert!(broken.left_error.is_some());
        assert!(broken.message.contains("无法读取尺寸"));

        assert!(results
            .iter()
            .any(|item| item.file_name == "ok.png" && item.status == CompareStatus::Match));
    }

    #[test]
    fn reports_when_both_sides_are_invalid_images() {
        let left = tempdir().expect("left tempdir");
        let right = tempdir().expect("right tempdir");

        fs::write(left.path().join("broken.png"), b"not a png").expect("write left broken png");
        fs::write(right.path().join("broken.png"), b"not a png").expect("write right broken png");

        let results = compare_image_folders(
            left.path().to_string_lossy().into_owned(),
            right.path().to_string_lossy().into_owned(),
        )
        .expect("compare success");

        let broken = results
            .iter()
            .find(|item| item.file_name == "broken.png")
            .expect("broken result exists");
        assert_eq!(broken.status, CompareStatus::SizeMismatch);
        assert!(broken.left_error.is_some());
        assert!(broken.right_error.is_some());
        assert!(broken.message.contains("A/B 均无法读取尺寸"));
    }
}

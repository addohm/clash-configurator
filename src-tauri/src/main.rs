// The Windows app: a window showing the page built into dist/. The page has
// no plugins of its own (no file, shell or network access); see
// capabilities/default.json. Its only way to touch the disk is `save_file`
// below, which writes nothing until the user picks a place in a Save dialog.

// Release builds on Windows open without a console window behind the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_dialog::DialogExt;

/// The largest file the page may save: well above any real config (the
/// intake limit is 8 MB), so a bug can't fill the disk.
const MAX_SAVE_BYTES: usize = 64 * 1024 * 1024;

/// What's being saved, which decides the dialog's file type.
#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum SaveKind {
    Config,
    Settings,
}

/// A safe file name: the last path part only, with characters Windows
/// refuses replaced, and a fallback if nothing is left.
fn file_name(suggested: &str, fallback: &str) -> String {
    let last = suggested.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = last
        .chars()
        .map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c })
        .take(120)
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() { fallback.to_string() } else { trimmed.to_string() }
}

/// Shows a Save dialog and writes `contents` where the user chose. Returns
/// the path, or None if they cancelled.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, kind: SaveKind, name: String, contents: String) -> Result<Option<String>, String> {
    if contents.len() > MAX_SAVE_BYTES {
        return Err("too big to save".into());
    }
    let dialog = app.dialog().file();
    let dialog = match kind {
        SaveKind::Config => dialog
            .set_file_name(file_name(&name, "config.yaml"))
            .add_filter("Clash config", &["yaml", "yml"]),
        SaveKind::Settings => dialog
            .set_file_name(file_name(&name, "settings.ccsettings.json"))
            .add_filter("Clash Configurator settings", &["json"]),
    };
    // Blocking is fine here: async commands run off the main thread.
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file])
        .run(tauri::generate_context!())
        .expect("Clash Configurator failed to start");
}

#[cfg(test)]
mod tests {
    use super::file_name;

    #[test]
    fn file_names_stay_in_the_chosen_folder() {
        assert_eq!(file_name("WF_SIMPLE (edited).yaml", "x"), "WF_SIMPLE (edited).yaml");
        assert_eq!(file_name("..\\..\\Windows\\evil.yaml", "x"), "evil.yaml");
        assert_eq!(file_name("a/b/c.yaml", "x"), "c.yaml");
        assert_eq!(file_name("con<>:fig?.yaml", "x"), "con___fig_.yaml");
        assert_eq!(file_name("...", "config.yaml"), "config.yaml");
        assert_eq!(file_name("", "config.yaml"), "config.yaml");
    }
}

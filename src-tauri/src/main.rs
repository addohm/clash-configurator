// The Windows app: a window showing the page built into dist/. The page has
// no plugins of its own (no file, shell or network access); see
// capabilities/default.json. It can ask the app for three things only:
// `save_file`, which writes nothing until the user picks a place in a Save
// dialog; `fetch_subscription`, which fetches one URL the user gave,
// through the checks in ../fetcher (public addresses only, size and time
// limits, text only); and Send to phone (`share_start`, `share_status`,
// `share_stop`), which offers the new files on the local Wi-Fi for a few
// minutes behind a random link (../sharer). Besides those, the app goes
// online only to check its GitHub releases for a newer version
// (`update_check`), and installs one only when asked (`update_install`),
// after checking its signature against the key built into this app.

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
    /// Shadowrocket's config.
    Conf,
    /// Shadowrocket's server list (share links, base64).
    Servers,
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
        SaveKind::Conf => dialog
            .set_file_name(file_name(&name, "config.conf"))
            .add_filter("Shadowrocket config", &["conf"]),
        SaveKind::Servers => dialog
            .set_file_name(file_name(&name, "servers.txt"))
            .add_filter("Server list", &["txt"]),
    };
    // Blocking is fine here: async commands run off the main thread.
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

/// Fetches a subscription URL the user typed (see ../fetcher for the checks).
#[tauri::command]
async fn fetch_subscription(url: String) -> Result<cc_fetcher::Fetched, cc_fetcher::FetchError> {
    cc_fetcher::fetch(&url).await
}

/// The Send to phone that's running, if any: one at a time.
#[derive(Default)]
struct Sharing(std::sync::Mutex<Option<cc_sharer::Share>>);

impl Sharing {
    fn lock(&self) -> std::sync::MutexGuard<'_, Option<cc_sharer::Share>> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[derive(serde::Serialize)]
struct Started {
    /// The phone's page, for the QR code.
    url: String,
    /// The PC address it's offered on, and the others to try.
    address: String,
    addresses: Vec<String>,
}

/// Offers `files` to a phone on the same Wi-Fi (see ../sharer). `address`
/// picks one of the PC's local addresses; the likeliest by default. Errors
/// are codes the page has text for.
#[tauri::command]
async fn share_start(
    sharing: tauri::State<'_, Sharing>,
    files: Vec<cc_sharer::File>,
    page: cc_sharer::Page,
    address: Option<String>,
) -> Result<Started, String> {
    let addresses = cc_sharer::lan_addresses();
    let chosen = match address {
        Some(a) => addresses.iter().copied().find(|x| x.to_string() == a).ok_or("not-local")?,
        None => *addresses.first().ok_or("no-network")?,
    };
    // A new share ends the old one first (dropping a Share stops it).
    sharing.lock().take();
    let share = cc_sharer::start(std::net::IpAddr::V4(chosen), files, page, cc_sharer::TTL)
        .await
        .map_err(|e| match e {
            cc_sharer::StartError::BadFiles => "bad-files".to_string(),
            cc_sharer::StartError::Listen(_) => "listen".to_string(),
        })?;
    let url = share.url.clone();
    *sharing.lock() = Some(share);
    Ok(Started { url, address: chosen.to_string(), addresses: addresses.iter().map(|a| a.to_string()).collect() })
}

/// How the share is going: time left and files fetched, or how it ended.
#[tauri::command]
fn share_status(sharing: tauri::State<'_, Sharing>) -> Option<cc_sharer::Status> {
    sharing.lock().as_ref().map(|s| s.status())
}

#[tauri::command]
fn share_stop(sharing: tauri::State<'_, Sharing>) {
    sharing.lock().take();
}

#[derive(serde::Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

/// Asks the project's GitHub releases whether there's a newer version
/// (PLAN.md Q20). Nothing is downloaded.
#[tauri::command]
async fn update_check(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo { version: u.version, notes: u.body }))
}

/// Downloads the newer version, checks its signature, and installs it. On
/// Windows the installer closes the app and opens the new one.
#[tauri::command]
async fn update_install(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let Some(update) = update else {
        return Err("no-update".into());
    };
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Sharing::default())
        .invoke_handler(tauri::generate_handler![save_file, fetch_subscription, share_start, share_status, share_stop, update_check, update_install])
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

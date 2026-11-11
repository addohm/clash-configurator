// The Windows app: a window showing the page built into dist/. It has no
// plugins (no file, shell or network access for the page) until a feature
// needs one; see capabilities/default.json.

// Release builds on Windows open without a console window behind the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Clash Configurator failed to start");
}

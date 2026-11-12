//! Sends files to a phone on the same Wi-Fi (PLAN.md Q19): a tiny HTTP
//! server on the PC's local address, for a few minutes, behind a random
//! path. It serves a page for the phone (buttons that hand each file to the
//! phone's app) and the files, nothing else. It stops when every file has
//! been fetched, after five minutes, when asked, or after too many wrong
//! requests (someone guessing the path).
//!
//! Plain HTTP: phones' apps can't trust a certificate made on this PC. The
//! path holds 128 random bits and lives a few minutes, but someone watching
//! the Wi-Fi could read the files, so the page says to use a network you
//! trust.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Semaphore;

/// How long the files are offered.
pub const TTL: Duration = Duration::from_secs(5 * 60);
/// After the last file is fetched, a little longer for an app that fetches twice.
pub const GRACE: Duration = Duration::from_secs(30);
/// Wrong paths before it stops: nobody with the link needs this many.
const MAX_BAD: u32 = 20;
/// A request line and headers larger than this aren't a phone's app.
const MAX_REQUEST: usize = 8 * 1024;
const READ_TIMEOUT: Duration = Duration::from_secs(5);
const WRITE_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_CONNECTIONS: usize = 16;
const MAX_FILES: usize = 4;
const MAX_FILE_BYTES: usize = 16 * 1024 * 1024;

/// One file to send. `path` is its last URL part (`config.yaml`); `name` is
/// the name the phone saves it under.
#[derive(Clone, Debug, Deserialize)]
pub struct File {
    pub path: String,
    pub name: String,
    pub contents: String,
}

/// What a button on the phone's page does with its file.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Action {
    /// Stash's install-config link.
    Stash,
    /// Clash Meta for Android's and FlClash's install-config link.
    Clash,
    /// Shadowrocket: add a subscription (the server list).
    ShadowrocketServers,
    /// Shadowrocket: add a config.
    ShadowrocketConfig,
    /// The file itself, to download.
    Download,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Button {
    pub label: String,
    /// The `path` of one of the files.
    pub file: String,
    pub action: Action,
}

/// The page the phone opens from the QR code. All text comes from the
/// app's page (its English text file) and is escaped here.
#[derive(Clone, Debug, Deserialize)]
pub struct Page {
    pub title: String,
    pub intro: String,
    pub buttons: Vec<Button>,
    pub note: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum Status {
    Running {
        #[serde(rename = "secondsLeft")]
        seconds_left: u64,
        /// The `path`s fetched so far.
        fetched: Vec<String>,
    },
    /// Every file was fetched.
    Done,
    /// Time ran out first.
    Expired,
    Stopped,
    /// Stopped after too many wrong requests.
    Guessing,
}

#[derive(Debug, PartialEq, Eq)]
pub enum StartError {
    /// Files that can't be served: none, too many, too big, a bad path, or a
    /// button naming no file.
    BadFiles,
    /// Couldn't listen on the address.
    Listen(String),
}

impl std::fmt::Display for StartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StartError::BadFiles => f.write_str("bad-files"),
            StartError::Listen(e) => write!(f, "listen: {e}"),
        }
    }
}

/// The PC's addresses a phone on the same Wi-Fi could reach, likeliest
/// first: home-network addresses (192.168, then 10, then 172.16), with
/// virtual adapters (WSL, VirtualBox, VPNs and proxy apps' TUN) last.
pub fn lan_addresses() -> Vec<Ipv4Addr> {
    let Ok(interfaces) = if_addrs::get_if_addrs() else {
        return Vec::new();
    };
    let mut found: Vec<(u8, Ipv4Addr)> = interfaces
        .iter()
        .filter(|i| i.is_oper_up() && !i.is_loopback() && !i.is_p2p())
        .filter_map(|i| match i.ip() {
            IpAddr::V4(a) if a.is_private() => Some((rank(&i.name, a), a)),
            _ => None,
        })
        .collect();
    found.sort();
    found.dedup_by_key(|(_, a)| *a);
    found.into_iter().map(|(_, a)| a).collect()
}

fn rank(name: &str, a: Ipv4Addr) -> u8 {
    const VIRTUAL: [&str; 14] = [
        "vethernet", "virtualbox", "vmware", "wsl", "hyper-v", "docker", "tailscale", "zerotier", "vpn", "wintun", "tun", "tap",
        "clash", "mihomo",
    ];
    let name = name.to_lowercase();
    let virtual_adapter = VIRTUAL.iter().any(|v| name.contains(v)) || a.octets()[..3] == [192, 168, 56];
    let home = match a.octets() {
        [192, 168, ..] => 0,
        [10, ..] => 1,
        _ => 2,
    };
    if virtual_adapter { 10 + home } else { home }
}

struct Inner {
    deadline: Instant,
    fetched: Vec<bool>,
    bad: u32,
    end: Option<Status>,
}

/// What the server and its connections share.
struct Shared {
    token: String,
    files: Vec<File>,
    page: Vec<u8>,
    inner: Mutex<Inner>,
}

impl Shared {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        // A panic while holding the lock can't leave Inner half-changed.
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// A running share. Dropping it stops it.
pub struct Share {
    /// The page's address, for the QR code.
    pub url: String,
    shared: Arc<Shared>,
}

impl Share {
    pub fn status(&self) -> Status {
        let mut inner = self.shared.lock();
        settle(&mut inner);
        if let Some(end) = &inner.end {
            return end.clone();
        }
        let seconds_left = inner.deadline.saturating_duration_since(Instant::now()).as_secs();
        let fetched = self.shared.files.iter().zip(&inner.fetched).filter(|(_, f)| **f).map(|(file, _)| file.path.clone()).collect();
        Status::Running { seconds_left, fetched }
    }

    pub fn stop(&self) {
        let mut inner = self.shared.lock();
        if inner.end.is_none() {
            inner.end = Some(Status::Stopped);
        }
    }
}

impl Drop for Share {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Ends the share once its time is up.
fn settle(inner: &mut Inner) {
    if inner.end.is_none() && Instant::now() >= inner.deadline {
        inner.end = Some(if inner.fetched.iter().all(|f| *f) { Status::Done } else { Status::Expired });
    }
}

fn valid(files: &[File], page: &Page) -> bool {
    let path_ok = |p: &str| !p.is_empty() && p.len() <= 40 && p.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-') && !p.starts_with('.');
    let mut paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
    paths.sort();
    paths.dedup();
    !files.is_empty()
        && files.len() <= MAX_FILES
        && paths.len() == files.len()
        && files.iter().all(|f| path_ok(&f.path) && f.contents.len() <= MAX_FILE_BYTES)
        && page.buttons.iter().all(|b| files.iter().any(|f| f.path == b.file))
}

/// Starts offering `files` on `address` for `ttl` (TTL in the app; shorter
/// in tests). The phone opens `Share::url`.
pub async fn start(address: IpAddr, files: Vec<File>, page: Page, ttl: Duration) -> Result<Share, StartError> {
    if !valid(&files, &page) {
        return Err(StartError::BadFiles);
    }
    let listener = TcpListener::bind(SocketAddr::new(address, 0)).await.map_err(|e| StartError::Listen(e.to_string()))?;
    let port = listener.local_addr().map_err(|e| StartError::Listen(e.to_string()))?.port();
    let token = random_token().map_err(StartError::Listen)?;
    let url = format!("http://{address}:{port}/{token}/");
    let html = render(&page, &url);
    let fetched = vec![false; files.len()];
    let shared = Arc::new(Shared {
        token,
        files,
        page: html.into_bytes(),
        inner: Mutex::new(Inner { deadline: Instant::now() + ttl, fetched, bad: 0, end: None }),
    });
    tokio::spawn(serve(listener, Arc::clone(&shared)));
    Ok(Share { url, shared })
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Accepts connections until the share ends; then the port closes.
async fn serve(listener: TcpListener, shared: Arc<Shared>) {
    let permits = Arc::new(Semaphore::new(MAX_CONNECTIONS));
    loop {
        {
            let mut inner = shared.lock();
            settle(&mut inner);
            if inner.end.is_some() {
                return;
            }
        }
        // Short waits, so a stop or the deadline is noticed quickly.
        let Ok(Ok((stream, _))) = tokio::time::timeout(Duration::from_millis(250), listener.accept()).await else {
            continue;
        };
        let Ok(permit) = Arc::clone(&permits).try_acquire_owned() else {
            continue; // too many at once: drop this one
        };
        let shared = Arc::clone(&shared);
        tokio::spawn(async move {
            let _permit = permit;
            handle(stream, &shared).await;
        });
    }
}

/// Reads one request's head, or None if it's too big, too slow or broken.
async fn read_head(stream: &mut TcpStream) -> Option<Vec<u8>> {
    let read = async {
        let mut head = Vec::with_capacity(1024);
        let mut chunk = [0u8; 1024];
        loop {
            if head.windows(4).any(|w| w == b"\r\n\r\n") {
                return Some(head);
            }
            if head.len() >= MAX_REQUEST {
                return None;
            }
            let n = stream.read(&mut chunk).await.ok()?;
            if n == 0 {
                return None;
            }
            head.extend_from_slice(&chunk[..n]);
        }
    };
    tokio::time::timeout(READ_TIMEOUT, read).await.ok().flatten()
}

#[derive(Clone, Copy)]
enum Reply {
    Page,
    File(usize),
    NotFound,
    NotAllowed,
    Ended,
}

async fn handle(mut stream: TcpStream, shared: &Shared) {
    let Some(head) = read_head(&mut stream).await else {
        return;
    };
    let line = head.split(|b| *b == b'\r').next().unwrap_or_default();
    let line = String::from_utf8_lossy(line);
    let mut parts = line.split(' ');
    let (method, target) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let path = target.split('?').next().unwrap_or("");
    let head_only = method == "HEAD";
    let base = format!("/{}/", shared.token);

    let reply = if shared.lock().end.is_some() {
        Reply::Ended
    } else if method != "GET" && !head_only {
        Reply::NotAllowed
    } else if path == base {
        Reply::Page
    } else if let Some(i) = path.strip_prefix(&base).and_then(|p| shared.files.iter().position(|f| f.path == p)) {
        Reply::File(i)
    } else {
        // A phone's browser asks for an icon by itself; that isn't guessing.
        if path != "/favicon.ico" {
            let mut inner = shared.lock();
            inner.bad += 1;
            if inner.bad >= MAX_BAD && inner.end.is_none() {
                inner.end = Some(Status::Guessing);
            }
        }
        Reply::NotFound
    };

    let (status, kind, disposition, body): (&str, &str, Option<String>, &[u8]) = match reply {
        Reply::Page => ("200 OK", "text/html; charset=utf-8", None, &shared.page),
        Reply::File(i) => {
            let f = &shared.files[i];
            let kind = if f.path.ends_with(".yaml") || f.path.ends_with(".yml") { "text/yaml; charset=utf-8" } else { "text/plain; charset=utf-8" };
            (
                "200 OK",
                kind,
                Some(format!("attachment; filename=\"{}\"; filename*=UTF-8''{}", ascii_name(&f.name), percent(&f.name))),
                f.contents.as_bytes(),
            )
        }
        Reply::NotFound => ("404 Not Found", "text/plain; charset=utf-8", None, b"Not found".as_slice()),
        Reply::NotAllowed => ("405 Method Not Allowed", "text/plain; charset=utf-8", None, b"Not allowed".as_slice()),
        Reply::Ended => ("410 Gone", "text/plain; charset=utf-8", None, b"This link has ended. Send it again from the PC.".as_slice()),
    };
    let mut out = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\
         X-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n\
         Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\r\n",
        body.len()
    );
    if let Some(d) = disposition {
        out.push_str(&format!("Content-Disposition: {d}\r\n"));
    }
    out.push_str("\r\n");
    let write = async {
        stream.write_all(out.as_bytes()).await?;
        if !head_only {
            stream.write_all(body).await?;
        }
        stream.flush().await?;
        stream.shutdown().await
    };
    let sent = matches!(tokio::time::timeout(WRITE_TIMEOUT, write).await, Ok(Ok(())));
    if let (true, false, Reply::File(i)) = (sent, head_only, reply) {
        let mut inner = shared.lock();
        inner.fetched[i] = true;
        if inner.fetched.iter().all(|f| *f) {
            inner.deadline = inner.deadline.min(Instant::now() + GRACE);
        }
    }
}

/// The file name for the old `filename=`: ASCII only, no quotes.
fn ascii_name(name: &str) -> String {
    name.chars().map(|c| if (c.is_ascii_graphic() && c != '"' && c != '\\') || c == ' ' { c } else { '_' }).collect()
}

/// Percent-encodes everything but letters, digits and `-._~`.
fn percent(text: &str) -> String {
    text.bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b"-._~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect()
}

fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// Where a button leads: the phone's app's own link, with the file's address.
fn href(action: Action, file_url: &str) -> String {
    match action {
        Action::Stash => format!("stash://install-config?url={}", percent(file_url)),
        Action::Clash => format!("clash://install-config?url={}", percent(file_url)),
        // Shadowrocket's manual: the address as it is, after the prefix.
        Action::ShadowrocketServers => format!("shadowrocket://add/{file_url}"),
        Action::ShadowrocketConfig => format!("shadowrocket://config/add/{file_url}"),
        Action::Download => file_url.to_string(),
    }
}

fn render(page: &Page, url: &str) -> String {
    let buttons: String = page
        .buttons
        .iter()
        .map(|b| {
            let class = if b.action == Action::Download { "d" } else { "b" };
            format!("<a class=\"{class}\" href=\"{}\">{}</a>\n", escape(&href(b.action, &format!("{url}{}", b.file))), escape(&b.label))
        })
        .collect();
    format!(
        "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>{title}</title>\
         <style>body{{margin:0;padding:1.25rem;max-width:32rem;font:16px/1.5 -apple-system,system-ui,sans-serif;color:#1f2933;background:#f5f7fa}}\
         h1{{font-size:1.25rem}}a.b{{display:block;margin:.75rem 0;padding:.9rem 1rem;border-radius:10px;background:#2563eb;color:#fff;\
         font-weight:600;text-align:center;text-decoration:none}}a.d{{display:block;margin:.5rem 0;color:#2563eb}}p.n{{color:#52606d;font-size:.9rem}}</style>\
         </head><body>\n<h1>{title}</h1>\n<p>{intro}</p>\n{buttons}<p class=\"n\">{note}</p>\n</body></html>\n",
        title = escape(&page.title),
        intro = escape(&page.intro),
        note = escape(&page.note),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCAL: IpAddr = IpAddr::V4(Ipv4Addr::LOCALHOST);

    fn files() -> Vec<File> {
        vec![
            File { path: "config.conf".into(), name: "My config (edited).conf".into(), contents: "[General]\n".into() },
            File { path: "servers.txt".into(), name: "servers.txt".into(), contents: "dHJvamFu".into() },
        ]
    }

    fn page() -> Page {
        Page {
            title: "Send to <phone>".into(),
            intro: "Tap in order.".into(),
            buttons: vec![
                Button { label: "1. Servers".into(), file: "servers.txt".into(), action: Action::ShadowrocketServers },
                Button { label: "2. Config".into(), file: "config.conf".into(), action: Action::ShadowrocketConfig },
                Button { label: "Stash".into(), file: "config.conf".into(), action: Action::Stash },
                Button { label: "Download".into(), file: "config.conf".into(), action: Action::Download },
            ],
            note: "Trusted Wi-Fi only.".into(),
        }
    }

    /// One raw request; the whole reply, or "" if the connection was refused.
    async fn request(url: &str, method: &str, path: &str) -> String {
        let host = url.trim_start_matches("http://").split('/').next().unwrap().to_string();
        let Ok(mut s) = TcpStream::connect(&host).await else {
            return String::new();
        };
        s.write_all(format!("{method} {path} HTTP/1.1\r\nHost: {host}\r\n\r\n").as_bytes()).await.unwrap();
        let mut out = Vec::new();
        let _ = s.read_to_end(&mut out).await;
        String::from_utf8_lossy(&out).into_owned()
    }

    fn base(url: &str) -> String {
        format!("/{}", url.splitn(4, '/').nth(3).unwrap())
    }

    #[tokio::test]
    async fn serves_the_page_and_files_at_the_random_path_only() {
        let share = start(LOCAL, files(), page(), TTL).await.unwrap();
        let path = base(&share.url);
        assert_eq!(path.len(), 34, "a 32-character random path");

        let html = request(&share.url, "GET", &path).await;
        assert!(html.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(html.contains("<h1>Send to &lt;phone&gt;</h1>"), "text is escaped");
        assert!(html.contains(&format!("href=\"shadowrocket://add/{}servers.txt\"", share.url)));
        assert!(html.contains(&format!("href=\"shadowrocket://config/add/{}config.conf\"", share.url)));
        assert!(html.contains(&format!("href=\"stash://install-config?url={}\"", percent(&format!("{}config.conf", share.url)))));
        assert!(html.contains(&format!("<a class=\"d\" href=\"{}config.conf\">Download</a>", share.url)));

        let head = request(&share.url, "HEAD", &format!("{path}config.conf")).await;
        assert!(head.contains("Content-Length: 10\r\n") && head.ends_with("\r\n\r\n"), "HEAD: headers only");
        assert_eq!(share.status(), Status::Running { seconds_left: 299, fetched: vec![] }, "HEAD isn't a fetch");

        let conf = request(&share.url, "GET", &format!("{path}config.conf?x=1")).await;
        assert!(conf.contains("Content-Disposition: attachment; filename=\"My config (edited).conf\"; filename*=UTF-8''My%20config%20%28edited%29.conf\r\n"));
        assert!(conf.ends_with("\r\n\r\n[General]\n"));
        assert!(matches!(share.status(), Status::Running { fetched, .. } if fetched == vec!["config.conf".to_string()]));

        for wrong in ["/", "/config.conf", &format!("{path}../config.conf"), &format!("{}/", &path[..32])] {
            assert!(request(&share.url, "GET", wrong).await.starts_with("HTTP/1.1 404"), "{wrong}");
        }
        assert!(request(&share.url, "POST", &path).await.starts_with("HTTP/1.1 405"));
    }

    #[tokio::test]
    async fn ends_once_every_file_is_fetched() {
        let share = start(LOCAL, files(), page(), Duration::from_secs(1)).await.unwrap();
        let path = base(&share.url);
        request(&share.url, "GET", &format!("{path}config.conf")).await;
        request(&share.url, "GET", &format!("{path}servers.txt")).await;
        tokio::time::sleep(Duration::from_millis(1500)).await;
        assert_eq!(share.status(), Status::Done);
        assert_eq!(request(&share.url, "GET", &path).await, "", "the port is closed");
    }

    #[tokio::test]
    async fn expires_and_stops() {
        let share = start(LOCAL, files(), page(), Duration::from_millis(300)).await.unwrap();
        tokio::time::sleep(Duration::from_millis(600)).await;
        assert_eq!(share.status(), Status::Expired);

        let share = start(LOCAL, files(), page(), TTL).await.unwrap();
        share.stop();
        assert_eq!(share.status(), Status::Stopped);
        tokio::time::sleep(Duration::from_millis(400)).await;
        assert_eq!(request(&share.url, "GET", &base(&share.url)).await, "");
    }

    #[tokio::test]
    async fn stops_when_someone_guesses() {
        let share = start(LOCAL, files(), page(), TTL).await.unwrap();
        for _ in 0..5 {
            assert!(request(&share.url, "GET", "/favicon.ico").await.starts_with("HTTP/1.1 404"));
        }
        for i in 0..MAX_BAD {
            request(&share.url, "GET", &format!("/guess{i}/")).await;
        }
        assert_eq!(share.status(), Status::Guessing);
    }

    #[tokio::test]
    async fn refuses_oversized_requests() {
        let share = start(LOCAL, files(), page(), TTL).await.unwrap();
        let host = share.url.trim_start_matches("http://").split('/').next().unwrap().to_string();
        let mut s = TcpStream::connect(&host).await.unwrap();
        let _ = s.write_all(format!("GET {} HTTP/1.1\r\nX: {}\r\n\r\n", base(&share.url), "a".repeat(MAX_REQUEST)).as_bytes()).await;
        let mut out = Vec::new();
        let _ = s.read_to_end(&mut out).await;
        assert!(out.is_empty(), "closed without a reply");
    }

    #[tokio::test]
    async fn refuses_files_it_should_not_serve() {
        let bad_path = vec![File { path: "../x".into(), name: "x".into(), contents: String::new() }];
        let mut twice = files();
        twice[1].path = "config.conf".into();
        let mut missing = page();
        missing.buttons[0].file = "nope.txt".into();
        for (f, p) in [(bad_path, page()), (twice, page()), (files(), missing), (vec![], page())] {
            assert!(matches!(start(LOCAL, f, p, TTL).await, Err(StartError::BadFiles)));
        }
    }

    #[test]
    fn offers_only_private_addresses() {
        assert!(lan_addresses().iter().all(|a| a.is_private()));
    }

    #[test]
    fn ranks_home_networks_before_virtual_adapters() {
        let a = |s: &str| s.parse::<Ipv4Addr>().unwrap();
        assert!(rank("Wi-Fi", a("192.168.1.20")) < rank("Ethernet", a("10.0.0.5")));
        assert!(rank("Ethernet", a("10.0.0.5")) < rank("Ethernet 2", a("172.16.0.5")));
        assert!(rank("Ethernet 2", a("172.16.0.5")) < rank("vEthernet (WSL)", a("192.168.80.1")));
        assert!(rank("Ethernet 3", a("192.168.56.1")) >= 10, "VirtualBox's host-only network");
    }
}

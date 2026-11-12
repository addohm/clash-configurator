//! Fetches a subscription URL for Clash Configurator (PLAN.md Q3, Q4, Q14).
//!
//! The same code serves the Windows app now and the website's fetcher later.
//! What comes back is treated as hostile, and so is where it points:
//!
//! - http and https only, at most 5 redirects, each checked again;
//! - only public addresses: names are resolved here and private, loopback,
//!   link-local and similar addresses are refused, so a subscription can't
//!   point the fetcher at the user's router or network;
//! - at most 8 MB, counted after decompression (no zip bombs), and 30 s;
//! - the body must be UTF-8 text.
//!
//! The system proxy is used when one is set (often the user's own Clash app,
//! which is how a subscription is reached from inside China). Through a
//! proxy, the proxy resolves names, so the address check covers only
//! addresses written in the URL itself.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Once};
use std::time::Duration;

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::redirect;
use url::{Host, Url};

/// The largest body read: the same limit the page's intake has.
pub const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_URL: usize = 4096;
const MAX_REDIRECTS: usize = 5;
const TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Providers send a Clash config to Clash apps, and other formats to others.
pub const USER_AGENT: &str = "Clash-Verge/1.0 (clash-verge-rev; mihomo)";

/// Why a fetch failed. The page turns the code into plain words.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "code", content = "detail", rename_all = "kebab-case")]
pub enum FetchError {
    BadUrl,
    PrivateAddress(String),
    TooManyRedirects,
    TooBig,
    Timeout,
    NotText,
    Status(u16),
    Network(String),
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for FetchError {}

/// A fetched subscription.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fetched {
    pub body: String,
    /// Where it was finally fetched from, after redirects.
    pub final_url: String,
    /// The provider's usage line (`subscription-userinfo`: upload, download,
    /// total, expire), if it sent one.
    pub userinfo: Option<String>,
    /// The subscription's name (`profile-title`, plain or `base64:`), if sent.
    pub profile_title: Option<String>,
    /// `content-disposition`, which often names the subscription's file.
    pub content_disposition: Option<String>,
    /// How often, in hours, the provider suggests updating (`profile-update-interval`).
    pub update_interval: Option<String>,
}

/// True for an address anyone on the internet could reach, false for this
/// device, the local network and other special ranges.
pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public_v4(v4);
            }
            let s = v6.segments();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (s[0] & 0xfe00) == 0xfc00 // unique local fc00::/7
                || (s[0] & 0xffc0) == 0xfe80 // link-local fe80::/10
                || (s[0] & 0xffc0) == 0xfec0 // old site-local fec0::/10
                || (s[0] == 0x2001 && s[1] == 0x0db8)) // documentation
        }
    }
}

fn is_public_v4(v4: Ipv4Addr) -> bool {
    let [a, b, c, _] = v4.octets();
    // 198.18.0.0/15 stays allowed: Clash's fake-IP mode answers every name
    // with an address there, and refusing it would break fetching whenever
    // the user's Clash app is running.
    !(v4.is_private()
        || v4.is_loopback()
        || v4.is_link_local()
        || v4.is_unspecified()
        || v4.is_broadcast()
        || v4.is_multicast()
        || a == 0
        || (a == 100 && (64..128).contains(&b)) // shared address space (CGNAT)
        || (a == 192 && b == 0 && c == 0) // IETF protocol assignments
        || (a == 192 && b == 0 && c == 2) // documentation
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 240) // reserved
}

/// Checks a URL: http(s), a host, and if the host is an address, a public one.
pub fn check_url(raw: &str) -> Result<Url, FetchError> {
    if raw.len() > MAX_URL || raw.chars().any(|c| c.is_control()) {
        return Err(FetchError::BadUrl);
    }
    let url = Url::parse(raw.trim()).map_err(|_| FetchError::BadUrl)?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(FetchError::BadUrl);
    }
    match url.host() {
        None => Err(FetchError::BadUrl),
        Some(Host::Ipv4(ip)) if !is_public(IpAddr::V4(ip)) => Err(FetchError::PrivateAddress(ip.to_string())),
        Some(Host::Ipv6(ip)) if !is_public(IpAddr::V6(ip)) => Err(FetchError::PrivateAddress(ip.to_string())),
        Some(_) => Ok(url),
    }
}

/// Resolves names, keeping only public addresses.
struct PublicOnly {
    /// Tests run a server on this machine; nothing else ever sets this.
    allow_loopback: bool,
}

impl Resolve for PublicOnly {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_string();
        let allow_loopback = self.allow_loopback;
        Box::pin(async move {
            let found: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0)).await?.collect();
            let ok: Vec<SocketAddr> = found
                .iter()
                .copied()
                .filter(|a| is_public(a.ip()) || (allow_loopback && a.ip().is_loopback()))
                .collect();
            if ok.is_empty() {
                let shown = found.first().map(|a| a.ip().to_string()).unwrap_or(host);
                return Err(Box::new(FetchError::PrivateAddress(shown)) as Box<dyn std::error::Error + Send + Sync>);
            }
            Ok(Box::new(ok.into_iter()) as Addrs)
        })
    }
}

static TLS: Once = Once::new();

/// Options, for tests: production uses `Options::default()`.
#[derive(Default, Clone)]
pub struct Options {
    pub allow_loopback: bool,
    pub no_proxy: bool,
    pub timeout: Option<Duration>,
}

fn client(opts: &Options) -> Result<reqwest::Client, FetchError> {
    TLS.call_once(|| {
        // Another part of the app may have installed one already; either is fine.
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
    let allow_loopback = opts.allow_loopback;
    let policy = redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            return attempt.error(FetchError::TooManyRedirects);
        }
        let next = attempt.url().as_str().to_string();
        match check_url(&next) {
            Ok(_) => attempt.follow(),
            Err(FetchError::PrivateAddress(ip)) if allow_loopback && ip.parse::<IpAddr>().is_ok_and(|a| a.is_loopback()) => attempt.follow(),
            Err(e) => attempt.error(e),
        }
    });
    let mut b = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(policy)
        .timeout(opts.timeout.unwrap_or(TIMEOUT))
        .connect_timeout(CONNECT_TIMEOUT)
        .gzip(true)
        .dns_resolver(Arc::new(PublicOnly { allow_loopback }));
    if opts.no_proxy {
        b = b.no_proxy();
    }
    b.build().map_err(|e| FetchError::Network(e.to_string()))
}

/// The FetchError inside a reqwest error (from our resolver or redirect policy), if any.
fn ours(e: &reqwest::Error) -> Option<FetchError> {
    let mut source: Option<&(dyn std::error::Error + 'static)> = Some(e);
    while let Some(s) = source {
        if let Some(f) = s.downcast_ref::<FetchError>() {
            return Some(f.clone());
        }
        source = s.source();
    }
    None
}

fn network(e: reqwest::Error) -> FetchError {
    if let Some(f) = ours(&e) {
        return f;
    }
    if e.is_timeout() {
        return FetchError::Timeout;
    }
    // Only the kind of failure, without the URL (it may hold the user's token).
    let what = if e.is_connect() { "could not connect" } else if e.is_request() { "request failed" } else { "connection failed" };
    FetchError::Network(what.to_string())
}

/// Fetches a subscription with the default options.
pub async fn fetch(raw_url: &str) -> Result<Fetched, FetchError> {
    fetch_with(raw_url, &Options::default()).await
}

pub async fn fetch_with(raw_url: &str, opts: &Options) -> Result<Fetched, FetchError> {
    let url = match check_url(raw_url) {
        Err(FetchError::PrivateAddress(ip)) if opts.allow_loopback && ip.parse::<IpAddr>().is_ok_and(|a| a.is_loopback()) => {
            Url::parse(raw_url.trim()).map_err(|_| FetchError::BadUrl)?
        }
        other => other?,
    };
    let mut res = client(opts)?.get(url).send().await.map_err(network)?;
    let status = res.status();
    if !status.is_success() {
        return Err(FetchError::Status(status.as_u16()));
    }
    if res.content_length().is_some_and(|n| n > MAX_BYTES as u64) {
        return Err(FetchError::TooBig);
    }
    let final_url = res.url().to_string();
    // Short, printable header values only.
    let header = |name: &str| {
        res.headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .filter(|v| v.len() < 512 && !v.chars().any(|c| c.is_control()))
            .map(str::to_string)
    };
    let userinfo = header("subscription-userinfo");
    let profile_title = header("profile-title");
    let content_disposition = header("content-disposition");
    let update_interval = header("profile-update-interval");
    // Read in chunks, counting decompressed bytes, so a small compressed
    // body can't grow into gigabytes.
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(network)? {
        if body.len() + chunk.len() > MAX_BYTES {
            return Err(FetchError::TooBig);
        }
        body.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(body).map_err(|_| FetchError::NotText)?;
    Ok(Fetched { body, final_url, userinfo, profile_title, content_disposition, update_interval })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv6Addr;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn public_and_private_addresses() {
        for ip in ["1.1.1.1", "223.5.5.5", "198.18.0.5", "2001:4860:4860::8888"] {
            assert!(is_public(ip.parse().unwrap()), "{ip}");
        }
        for ip in [
            "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
            "255.255.255.255", "224.0.0.1", "192.0.2.1", "240.0.0.1", "::1", "fe80::1", "fd00::1", "::ffff:192.168.1.1",
        ] {
            assert!(!is_public(ip.parse().unwrap()), "{ip}");
        }
        assert!(!is_public(IpAddr::V6(Ipv6Addr::UNSPECIFIED)));
    }

    #[test]
    fn urls() {
        assert!(check_url("https://sub.example.com/api/v1/client/subscribe?token=x").is_ok());
        assert!(check_url("http://1.1.1.1/x").is_ok());
        assert_eq!(check_url("ftp://example.com/x"), Err(FetchError::BadUrl));
        assert_eq!(check_url("file:///etc/passwd"), Err(FetchError::BadUrl));
        assert_eq!(check_url("not a url"), Err(FetchError::BadUrl));
        assert_eq!(check_url("https://example.com/\u{0}"), Err(FetchError::BadUrl));
        assert_eq!(check_url("http://192.168.1.1/admin"), Err(FetchError::PrivateAddress("192.168.1.1".into())));
        assert_eq!(check_url("http://[::1]:9090/"), Err(FetchError::PrivateAddress("::1".into())));
        assert_eq!(check_url("http://169.254.169.254/latest/meta-data"), Err(FetchError::PrivateAddress("169.254.169.254".into())));
    }

    /// A one-shot HTTP server on this machine that answers every request with `reply`.
    async fn serve(reply: Vec<u8>, times: usize) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            for _ in 0..times {
                let Ok((mut sock, _)) = listener.accept().await else { return };
                let mut buf = [0u8; 4096];
                let _ = sock.read(&mut buf).await;
                let _ = sock.write_all(&reply).await;
                let _ = sock.shutdown().await;
            }
        });
        format!("http://{addr}/sub")
    }

    fn test_opts() -> Options {
        Options { allow_loopback: true, no_proxy: true, timeout: Some(Duration::from_secs(5)) }
    }

    fn response(headers: &str, body: &[u8]) -> Vec<u8> {
        let mut r = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\n{headers}Connection: close\r\n\r\n", body.len()).into_bytes();
        r.extend_from_slice(body);
        r
    }

    #[tokio::test]
    async fn fetches_text_with_usage() {
        let headers = "subscription-userinfo: upload=1; download=2; total=3; expire=4\r\n\
                       profile-title: base64:TXkgU3Vi\r\n\
                       content-disposition: attachment; filename*=UTF-8''My%20Sub.yaml\r\n\
                       profile-update-interval: 24\r\n";
        let url = serve(response(headers, b"proxies: []\n"), 1).await;
        let f = fetch_with(&url, &test_opts()).await.unwrap();
        assert_eq!(f.body, "proxies: []\n");
        assert_eq!(f.userinfo.as_deref(), Some("upload=1; download=2; total=3; expire=4"));
        assert_eq!(f.profile_title.as_deref(), Some("base64:TXkgU3Vi"));
        assert_eq!(f.content_disposition.as_deref(), Some("attachment; filename*=UTF-8''My%20Sub.yaml"));
        assert_eq!(f.update_interval.as_deref(), Some("24"));
    }

    #[tokio::test]
    async fn refuses_loopback_without_the_test_switch() {
        let url = serve(response("", b"x"), 1).await;
        let opts = Options { allow_loopback: false, ..test_opts() };
        assert!(matches!(fetch_with(&url, &opts).await, Err(FetchError::PrivateAddress(_))));
    }

    #[tokio::test]
    async fn refuses_a_redirect_to_the_local_network() {
        let url = serve(b"HTTP/1.1 302 Found\r\nLocation: http://192.168.1.1/admin\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec(), 1).await;
        assert_eq!(fetch_with(&url, &test_opts()).await.unwrap_err(), FetchError::PrivateAddress("192.168.1.1".into()));
    }

    #[tokio::test]
    async fn refuses_too_big_by_header_and_by_count() {
        let big = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", MAX_BYTES + 1).into_bytes();
        let url = serve(big, 1).await;
        assert_eq!(fetch_with(&url, &test_opts()).await.unwrap_err(), FetchError::TooBig);
        // No length given: counted while reading.
        let mut r = b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".to_vec();
        r.extend(std::iter::repeat_n(b'a', MAX_BYTES + 10));
        let url = serve(r, 1).await;
        assert_eq!(fetch_with(&url, &test_opts()).await.unwrap_err(), FetchError::TooBig);
    }

    #[tokio::test]
    async fn refuses_binary_and_errors() {
        let url = serve(response("", &[0xff, 0xfe, 0x00]), 1).await;
        assert_eq!(fetch_with(&url, &test_opts()).await.unwrap_err(), FetchError::NotText);
        let url = serve(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec(), 1).await;
        assert_eq!(fetch_with(&url, &test_opts()).await.unwrap_err(), FetchError::Status(403));
    }

    #[tokio::test]
    async fn refuses_a_decompression_bomb() {
        // About 9 KB on the wire, 9 MB unpacked.
        let bomb: &[u8] = include_bytes!("../tests/data/bomb.gz");
        let url = serve(response("Content-Encoding: gzip\r\n", bomb), 1).await;
        assert_eq!(fetch_with(&url, &test_opts()).await.unwrap_err(), FetchError::TooBig);
    }

    /// Needs the internet: `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn fetches_over_https() {
        let f = fetch_with("https://www.gstatic.com/generate_204", &Options { no_proxy: true, ..Options::default() }).await.unwrap();
        assert_eq!(f.body, "");
        assert!(f.final_url.starts_with("https://www.gstatic.com/"));
    }

    #[tokio::test]
    async fn sends_a_clash_user_agent() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let seen = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let n = sock.read(&mut buf).await.unwrap();
            sock.write_all(&response("", b"ok")).await.unwrap();
            String::from_utf8_lossy(&buf[..n]).to_lowercase()
        });
        fetch_with(&format!("http://{addr}/"), &test_opts()).await.unwrap();
        assert!(seen.await.unwrap().contains("user-agent: clash-verge/1.0 (clash-verge-rev; mihomo)"));
    }
}

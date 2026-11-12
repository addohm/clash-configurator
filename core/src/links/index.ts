// Share links: turning vless://, trojan://, ss://, hysteria2:// and vmess://
// links into mihomo server entries.
export { LINK_ERRORS, LinkError, parseLink, parseLinks, type LinkErrorCode, type ParsedLinks, type Server } from './parse';
export { writeLink, type WriteResult } from './write';

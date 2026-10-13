//! Consumer-side SSE framing only. No coding runtime, authorization policy, or event mutation.
use serde::Serialize;
use serde_json::Value;

pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
pub const MAX_BATCH_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_BATCH_EVENTS: usize = 512;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub event_id: Option<String>,
    pub directory: Option<String>,
    pub payload: Value,
}

fn js_whitespace(ch: char) -> bool {
    // Match the whitespace accepted by the existing JavaScript SSE envelope parser.
    matches!(ch, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' |
        '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' |
        '\u{3000}' | '\u{feff}')
}

pub fn parse_block(block: &str) -> Result<Option<Envelope>, &'static str> {
    let event_id = block
        .lines()
        .find_map(|line| {
            line.strip_prefix("id:")
                .map(|id| id.trim_matches(js_whitespace).to_owned())
        })
        .filter(|id| !id.is_empty());
    let data = block
        .split('\n')
        .filter_map(|line| {
            line.strip_prefix("data:")
                .map(|value| match value.chars().next() {
                    Some(ch) if js_whitespace(ch) => &value[ch.len_utf8()..],
                    _ => value,
                })
        })
        .collect::<Vec<_>>()
        .join("\n");
    let parsed: Value = match serde_json::from_str(data.trim_matches(js_whitespace)) {
        Ok(parsed) => parsed,
        Err(error) => {
            // V8 accepts lone UTF-16 surrogates and overflowed JSON numbers. Do not silently
            // advance a native cursor past values this Rust representation cannot preserve.
            let message = error.to_string();
            if message.contains("surrogate")
                || message.starts_with("invalid unicode code point")
                || message.starts_with("unexpected end of hex escape")
                || message.starts_with("number out of range")
            {
                return Err("unsupported_json");
            }
            return Ok(None);
        }
    };
    let string = |value: Option<&Value>| {
        value
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    };
    if let Some(payload) = parsed
        .get("payload")
        .filter(|value| value.is_object() || value.is_array())
    {
        return Ok(Some(Envelope {
            event_id,
            directory: string(parsed.get("directory")),
            payload: payload.clone(),
        }));
    }
    Ok(Some(Envelope {
        event_id,
        directory: string(parsed.get("directory"))
            .or_else(|| string(parsed.get("properties").and_then(|p| p.get("directory")))),
        payload: parsed,
    }))
}

/// Keep a partial UTF-8 frame until its delimiter; CRLF and Unicode may span network reads.
#[derive(Default)]
pub struct Decoder {
    frame: Vec<u8>,
    pending_cr: bool,
}

impl Decoder {
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Envelope>, &'static str> {
        let mut events = Vec::new();
        for byte in bytes {
            if self.pending_cr {
                self.pending_cr = false;
                if *byte == b'\n' {
                    self.append(b'\n', &mut events)?;
                    continue;
                }
                self.append(b'\r', &mut events)?;
            }
            if *byte == b'\r' {
                self.pending_cr = true;
            } else {
                self.append(*byte, &mut events)?;
            }
        }
        Ok(events)
    }

    fn append(&mut self, byte: u8, events: &mut Vec<Envelope>) -> Result<(), &'static str> {
        self.frame.push(byte);
        if self.frame.len() > MAX_FRAME_BYTES {
            return Err("frame_limit");
        }
        if self.frame.ends_with(b"\n\n") {
            if let Some(event) = parse_block(&String::from_utf8_lossy(
                &self.frame[..self.frame.len() - 2],
            ))? {
                events.push(event);
            }
            self.frame.clear();
        }
        Ok(())
    }

    pub fn finish(&mut self) -> Result<Vec<Envelope>, &'static str> {
        let mut events = Vec::new();
        if self.pending_cr {
            self.pending_cr = false;
            self.append(b'\r', &mut events)?;
        }
        if let Some(event) = parse_block(&String::from_utf8_lossy(&self.frame))? {
            events.push(event);
        }
        self.frame.clear();
        Ok(events)
    }
}

pub fn validate_endpoint(endpoint: &str) -> Result<reqwest::Url, &'static str> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| "invalid_endpoint")?;
    let loopback = url.host_str().and_then(|host| host.trim_matches(['[', ']']).parse::<std::net::IpAddr>().ok()).is_some_and(|ip| {
        ip.is_loopback() || matches!(ip, std::net::IpAddr::V6(ip) if ip.to_ipv4_mapped().is_some_and(|ip| ip.is_loopback()))
    });
    if url.scheme() != "http"
        || !loopback
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/global/event"
    {
        return Err("invalid_endpoint");
    }
    Ok(url)
}

/// Frames are preserved individually and in order. Batching never merges or drops domain events.
pub fn frame_for(envelope: Envelope, connected: &mut bool, cursor: &mut String) -> Option<Value> {
    let payload = envelope.payload;
    if payload.is_null() || payload == false || payload == 0 || payload == "" {
        return None;
    }
    if let Some(id) = envelope.event_id.as_ref() {
        cursor.clone_from(id);
    }
    match payload.get("type").and_then(Value::as_str) {
        Some("server.connected") => {
            if *connected {
                return None;
            }
            *connected = true;
            Some(serde_json::json!({"type": "ready", "scope": "global"}))
        }
        Some("server.heartbeat") => None,
        _ => {
            let mut frame = serde_json::json!({
                "type": "event", "payload": payload, "directory": envelope.directory.unwrap_or_else(|| "global".into()),
            });
            if let Some(id) = envelope.event_id {
                frame["eventId"] = id.into();
            }
            Some(frame)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_byte_boundary_preserves_crlf_unicode_and_final_frame() {
        let source = "id: c1\r\ndata: {\"directory\":\"/project\",\"payload\":{\"type\":\"message.part.delta\",\"properties\":{\"delta\":\"\u{1f642}\u{00e9}\"}}}\r\n\r\nid: c2\ndata: {\"type\":\"session.updated\"}";
        let mut whole = Decoder::default();
        let mut expected = whole.push(source.as_bytes()).unwrap();
        expected.extend(whole.finish().unwrap());
        for split in 0..=source.len() {
            let mut decoder = Decoder::default();
            let mut actual = decoder.push(&source.as_bytes()[..split]).unwrap();
            actual.extend(decoder.push(&source.as_bytes()[split..]).unwrap());
            actual.extend(decoder.finish().unwrap());
            assert_eq!(actual, expected, "split {split}");
        }
        assert_eq!(expected.len(), 2);
    }

    #[test]
    fn malformed_data_is_ignored_and_first_id_matches_js() {
        assert!(
            parse_block("id: ignored\ndata: not-json")
                .unwrap()
                .is_none()
        );
        let event = parse_block("id: first\nid: second\ndata: {\ndata: \"type\": \"custom.event\",\ndata: \"properties\": {\"directory\":\"/legacy\"}} ").unwrap().unwrap();
        assert_eq!(event.event_id.as_deref(), Some("first"));
        assert_eq!(event.directory.as_deref(), Some("/legacy"));
    }

    #[test]
    fn unterminated_and_delimited_oversize_frames_are_rejected() {
        let mut decoder = Decoder::default();
        assert_eq!(
            decoder.push(&vec![b'x'; MAX_FRAME_BYTES + 1]),
            Err("frame_limit")
        );
        let mut decoder = Decoder::default();
        assert!(decoder.push(b"data: {}").is_ok());
        assert_eq!(decoder.finish().unwrap().len(), 1);
        assert!(decoder.finish().unwrap().is_empty());
    }

    #[test]
    fn unsupported_js_values_fail_without_silently_skipping_a_cursor() {
        for data in [
            r#"{"text":"\ud800"}"#,
            r#"{"text":"\udc00"}"#,
            r#"{"number":1e999}"#,
        ] {
            assert_eq!(
                parse_block(&format!("id: unsafe\ndata: {data}")),
                Err("unsupported_json"),
                "{data}: {:?}",
                serde_json::from_str::<Value>(data)
            );
        }
    }

    #[test]
    fn endpoint_requires_literal_loopback_without_credentials_or_redirect_targets() {
        for url in [
            "http://127.0.0.1:4096/global/event",
            "http://127.2.3.4/global/event",
            "http://[::1]/global/event",
            "http://[::ffff:127.0.0.1]/global/event",
        ] {
            assert!(validate_endpoint(url).is_ok());
        }
        for url in [
            "http://localhost/global/event",
            "http://127.gateway.example/global/event",
            "http://192.168.1.1/global/event",
            "https://127.0.0.1/global/event",
            "http://user:password@127.0.0.1/global/event",
            "http://127.0.0.1/global/event?token=secret",
            "http://127.0.0.1/global/event#secret",
            "http://127.0.0.1/session",
        ] {
            assert_eq!(validate_endpoint(url).unwrap_err(), "invalid_endpoint");
        }
    }

    #[test]
    fn subscription_controls_do_not_drop_domain_events_or_cursor() {
        let mut connected = false;
        let mut cursor = String::new();
        let mut frames = Vec::new();
        for (id, kind) in [
            ("c1", "server.connected"),
            ("c2", "custom.unknown"),
            ("c3", "server.heartbeat"),
            ("c4", "server.resync_required"),
        ] {
            if let Some(frame) = frame_for(
                Envelope {
                    event_id: Some(id.into()),
                    directory: None,
                    payload: serde_json::json!({"type":kind}),
                },
                &mut connected,
                &mut cursor,
            ) {
                frames.push(frame);
            }
        }
        assert_eq!(frames.len(), 3);
        assert_eq!(frames[0]["type"], "ready");
        assert_eq!(frames[1]["payload"]["type"], "custom.unknown");
        assert_eq!(frames[2]["payload"]["type"], "server.resync_required");
        assert_eq!(cursor, "c4");
    }
}

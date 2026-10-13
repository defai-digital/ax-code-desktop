use ax_desktop_event_client_experiment::{
    Decoder, MAX_BATCH_BYTES, MAX_BATCH_EVENTS, frame_for, validate_endpoint,
};
use reqwest::header::{AUTHORIZATION, HeaderValue};
use serde::Deserialize;
use std::io::{BufRead, Read, Write};
use std::time::Duration;
use tokio::time::{Instant, sleep_until};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    endpoint: String,
    authorization: Option<String>,
    #[serde(default)]
    last_event_id: String,
    #[serde(default = "default_wait")]
    batch_wait_ms: u64,
}
fn default_wait() -> u64 {
    2
}

fn flush(frames: &mut Vec<Vec<u8>>, cursor: &str, bytes: &mut usize) -> Result<(), &'static str> {
    if frames.is_empty() {
        return Ok(());
    }
    // Each validated frame is serialized once, then copied into a bounded batch envelope.
    let mut line = Vec::with_capacity(*bytes + 1024);
    line.extend_from_slice(b"{\"schema\":1,\"cursor\":");
    serde_json::to_writer(&mut line, cursor).map_err(|_| "encode_failed")?;
    line.extend_from_slice(b",\"frames\":[");
    for (index, frame) in frames.iter().enumerate() {
        if index > 0 {
            line.push(b',');
        }
        line.extend_from_slice(frame);
    }
    line.extend_from_slice(b"]}");
    if line.len() > MAX_BATCH_BYTES {
        return Err("batch_limit");
    }
    let mut stdout = std::io::stdout().lock();
    stdout
        .write_all(&line)
        .and_then(|_| stdout.write_all(b"\n"))
        .and_then(|_| stdout.flush())
        .map_err(|_| "consumer_closed")?;
    frames.clear();
    *bytes = 0;
    Ok(())
}

async fn stream(config: Config) -> Result<(), &'static str> {
    let endpoint = validate_endpoint(&config.endpoint)?;
    if config.batch_wait_ms > 8 || config.last_event_id.len() > 512 {
        return Err("invalid_config");
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(2))
        .read_timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "client_failed")?;
    let mut request = client
        .get(endpoint)
        .header("accept", "text/event-stream")
        .header("cache-control", "no-cache");
    if let Some(auth) = config.authorization {
        let mut header = HeaderValue::from_str(&auth).map_err(|_| "invalid_config")?;
        header.set_sensitive(true);
        request = request.header(AUTHORIZATION, header);
    }
    if !config.last_event_id.is_empty() {
        let header = HeaderValue::from_str(&config.last_event_id).map_err(|_| "invalid_config")?;
        request = request.header("last-event-id", header);
    }
    let mut response = request.send().await.map_err(|_| "connect_failed")?;
    if !response.status().is_success() {
        return Err("upstream_status");
    }
    if !response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            v.split(';')
                .next()
                .is_some_and(|v| v.trim() == "text/event-stream")
        })
    {
        return Err("upstream_content_type");
    }
    let mut decoder = Decoder::default();
    let mut frames = Vec::new();
    let mut bytes = 0;
    let mut cursor = config.last_event_id;
    let mut connected = false;
    let mut deadline = Instant::now();
    loop {
        let chunk = tokio::select! {
            biased;
            _ = sleep_until(deadline), if !frames.is_empty() => { flush(&mut frames, &cursor, &mut bytes)?; continue; }
            chunk = response.chunk() => chunk.map_err(|_| "stream_failed")?,
        };
        let events = match chunk.as_ref() {
            Some(chunk) if chunk.len() <= MAX_BATCH_BYTES => decoder.push(chunk)?,
            Some(_) => return Err("chunk_limit"),
            None => decoder.finish()?,
        };
        for event in events {
            // Flush the old batch before advancing its cursor to an event not yet delivered.
            if frames.len() == MAX_BATCH_EVENTS {
                flush(&mut frames, &cursor, &mut bytes)?;
            }
            let prior_cursor = cursor.clone();
            if let Some(frame) = frame_for(event, &mut connected, &mut cursor) {
                let encoded = serde_json::to_vec(&frame).map_err(|_| "encode_failed")?;
                let size = encoded.len();
                if size + 1024 > MAX_BATCH_BYTES {
                    return Err("batch_limit");
                }
                if bytes + size + 1024 > MAX_BATCH_BYTES {
                    flush(&mut frames, &prior_cursor, &mut bytes)?;
                }
                if frames.is_empty() {
                    deadline = Instant::now() + Duration::from_millis(config.batch_wait_ms);
                }
                bytes += size + 1;
                frames.push(encoded);
            }
        }
        if chunk.is_none() {
            flush(&mut frames, &cursor, &mut bytes)?;
            return Ok(());
        }
    }
}

fn decode_fixture() -> Result<(), &'static str> {
    let mut decoder = Decoder::default();
    let mut input = std::io::stdin().take(4 * 1024 * 1024 + 1);
    let mut bytes = Vec::new();
    input.read_to_end(&mut bytes).map_err(|_| "input_failed")?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("input_limit");
    }
    let mut events = Vec::new();
    for chunk in bytes.chunks(17) {
        events.extend(decoder.push(chunk)?);
    }
    events.extend(decoder.finish()?);
    serde_json::to_writer(std::io::stdout(), &events).map_err(|_| "consumer_closed")
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let result = if std::env::args().nth(1).as_deref() == Some("--decode-fixture") {
        decode_fixture()
    } else {
        let mut input = String::new();
        match std::io::stdin().lock().take(16385).read_line(&mut input) {
            Ok(_) if input.len() <= 16384 => match serde_json::from_str::<Config>(&input) {
                Ok(config) => stream(config).await,
                Err(_) => Err("invalid_config"),
            },
            _ => Err("invalid_config"),
        }
    };
    if let Err(code) = result {
        // Never print upstream URLs, response bodies, request configuration, or credentials.
        eprintln!("native_event_client:{code}");
        std::process::exit(1);
    }
}

//! Benchmark-only persistent parser. Never bundled with the desktop application.
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::time::Instant;

#[derive(Deserialize)]
struct Request {
    sources: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    trees: Vec<markdown::mdast::Node>,
    parse_ms: f64,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut options = markdown::ParseOptions::gfm();
    options.constructs.math_flow = true;
    options.constructs.math_text = true;
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    for line in stdin.lock().lines() {
        let request: Request = serde_json::from_str(&line?)?;
        let start = Instant::now();
        let trees = request
            .sources
            .iter()
            .map(|source| markdown::to_mdast(source, &options))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| io::Error::other(format!("{error:?}")))?;
        let response = Response {
            trees,
            parse_ms: start.elapsed().as_secs_f64() * 1000.0,
        };
        serde_json::to_writer(&mut stdout, &response)?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
    }
    Ok(())
}

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

use crate::state::StateManager;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum IncomingMsg {
    SessionStart { tool: String, session: String },
    Message { tool: String, delta: String },
    SessionEnd { tool: String },
    Cmd { action: String },
}

#[derive(Debug, Serialize)]
pub struct CmdResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn socket_path() -> PathBuf {
    let tmp = std::env::temp_dir();
    tmp.join("bitpet.sock")
}

pub async fn start_socket_server(
    state: Arc<StateManager>,
    event_tx: tokio::sync::mpsc::UnboundedSender<ServerEvent>,
) {
    let path = socket_path();
    // Clean up stale socket file.
    let _ = tokio::fs::remove_file(&path).await;

    let listener = match UnixListener::bind(&path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[BitPet] failed to bind socket: {e}");
            return;
        }
    };

    // Set socket permissions to 0600 (owner rw only).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let state = Arc::clone(&state);
                let tx = event_tx.clone();
                tokio::spawn(handle_connection(stream, state, tx));
            }
            Err(e) => {
                eprintln!("[BitPet] accept error: {e}");
            }
        }
    }
}

async fn handle_connection(
    stream: UnixStream,
    state: Arc<StateManager>,
    event_tx: tokio::sync::mpsc::UnboundedSender<ServerEvent>,
) {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    let rate_limit = Duration::from_millis(100); // max 10 msgs/sec
    let mut last_msg = Instant::now() - rate_limit;

    while let Ok(Some(line)) = lines.next_line().await {
        let now = Instant::now();
        if now.duration_since(last_msg) < rate_limit {
            continue; // drop, rate-limited
        }
        last_msg = now;

        let msg: IncomingMsg = match serde_json::from_str(&line) {
            Ok(m) => m,
            Err(_) => continue,
        };

        match msg {
            IncomingMsg::SessionStart { tool, session } => {
                state.touch();
                let _ = event_tx.send(ServerEvent::SessionStart { tool, session });
            }
            IncomingMsg::Message { tool: _, delta } => {
                let _ = event_tx.send(ServerEvent::MessageDelta { delta });
            }
            IncomingMsg::SessionEnd { tool: _ } => {
                let _ = event_tx.send(ServerEvent::SessionEnd);
            }
            IncomingMsg::Cmd { action } => {
                let (pet_state, err) = match action.as_str() {
                    "feed" => {
                        let s = state.feed();
                        state.save();
                        let _ = event_tx.send(ServerEvent::StateUpdate(s.clone()));
                        (Some(s), None)
                    }
                    "play" => {
                        let s = state.play();
                        state.save();
                        let _ = event_tx.send(ServerEvent::StateUpdate(s.clone()));
                        (Some(s), None)
                    }
                    "status" => (Some(state.get()), None),
                    "stop" => {
                        state.save();
                        let _ = event_tx.send(ServerEvent::Stop);
                        (None, None)
                    }
                    _ => (None, Some(format!("unknown action: {action}"))),
                };

                let resp = if let Some(err) = err {
                    CmdResponse { ok: false, data: None, error: Some(err) }
                } else {
                    let data = pet_state
                        .as_ref()
                        .and_then(|s| serde_json::to_value(s).ok());
                    CmdResponse { ok: true, data, error: None }
                };

                if let Ok(mut json) = serde_json::to_string(&resp) {
                    json.push('\n');
                    let _ = writer.write_all(json.as_bytes()).await;
                }
            }
        }
    }
}

/// Events the socket server sends to the Tauri main thread.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ServerEvent {
    SessionStart { tool: String, session: String },
    MessageDelta { delta: String },
    SessionEnd,
    StateUpdate(crate::state::PetState),
    Stop,
}

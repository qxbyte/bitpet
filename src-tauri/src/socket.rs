use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};

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

#[cfg(unix)]
pub fn ipc_endpoint() -> String {
    std::env::temp_dir()
        .join("bitpet.sock")
        .to_string_lossy()
        .into_owned()
}

#[cfg(windows)]
pub fn ipc_endpoint() -> String {
    r"\\.\pipe\bitpet".to_string()
}

#[cfg(unix)]
pub async fn start_socket_server(
    state: Arc<StateManager>,
    event_tx: tokio::sync::mpsc::UnboundedSender<ServerEvent>,
) {
    use tokio::net::UnixListener;

    let path = std::path::PathBuf::from(ipc_endpoint());
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
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));

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

#[cfg(windows)]
pub async fn start_socket_server(
    state: Arc<StateManager>,
    event_tx: tokio::sync::mpsc::UnboundedSender<ServerEvent>,
) {
    use tokio::net::windows::named_pipe::ServerOptions;

    let pipe_name = ipc_endpoint();

    loop {
        let server = match ServerOptions::new().create(&pipe_name) {
            Ok(server) => server,
            Err(e) => {
                eprintln!("[BitPet] failed to create named pipe: {e}");
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
        };

        match server.connect().await {
            Ok(()) => {
                let state = Arc::clone(&state);
                let tx = event_tx.clone();
                tokio::spawn(handle_connection(server, state, tx));
            }
            Err(e) => {
                eprintln!("[BitPet] named pipe connect error: {e}");
            }
        }
    }
}

async fn handle_connection<S>(
    stream: S,
    state: Arc<StateManager>,
    event_tx: tokio::sync::mpsc::UnboundedSender<ServerEvent>,
) where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let (reader, mut writer) = tokio::io::split(stream);
    let mut lines = BufReader::new(reader).lines();

    let rate_limit = Duration::from_millis(100); // max 10 delta msgs/sec
    let mut last_delta = Instant::now() - rate_limit;

    while let Ok(Some(line)) = lines.next_line().await {
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
                let now = Instant::now();
                if now.duration_since(last_delta) < rate_limit {
                    continue;
                }
                last_delta = now;
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
                        let _ = event_tx.send(ServerEvent::PlayAction);
                        let _ = event_tx.send(ServerEvent::StateUpdate(s.clone()));
                        (Some(s), None)
                    }
                    "sleep" => {
                        let s = state.sleep();
                        state.save();
                        let _ = event_tx.send(ServerEvent::SleepAction);
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
    PlayAction,
    SleepAction,
    Stop,
}

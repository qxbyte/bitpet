mod socket;
mod state;

use socket::{ServerEvent, start_socket_server};
use state::StateManager;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{Duration, interval};

#[tauri::command]
fn get_status(state: tauri::State<Arc<StateManager>>) -> serde_json::Value {
    let s = state.get();
    serde_json::to_value(s).unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = Arc::new(StateManager::new());

            // Position window. Use logical coordinates so Retina scaling is handled correctly.
            {
                let pet = state.get();
                if let Some(win) = app.get_webview_window("main") {
                    if let Ok(Some(mon)) = win.current_monitor() {
                        let scale = mon.scale_factor();
                        let phys = mon.size();
                        // Logical screen dimensions.
                        let lw = (phys.width  as f64 / scale) as i32;
                        let lh = (phys.height as f64 / scale) as i32;

                        let win_w = 110i32;
                        let win_h = 150i32;
                        let (x, y) = if pet.pos_x == -140.0 && pet.pos_y == -160.0 {
                            // First run: bottom-right, above Dock (~160px clearance).
                            (lw - win_w - 20, lh - win_h - 160)
                        } else {
                            // Restore saved position, clamped to visible area.
                            let rx = (pet.pos_x as i32).clamp(0, (lw - win_w).max(0));
                            let ry = (pet.pos_y as i32).clamp(0, (lh - win_h).max(0));
                            (rx, ry)
                        };
                        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }

            app.manage(Arc::clone(&state));

            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<ServerEvent>();
            let app_handle: AppHandle = app.handle().clone();
            let state_for_socket = Arc::clone(&state);

            // Socket server task.
            tauri::async_runtime::spawn(async move {
                start_socket_server(state_for_socket, tx).await;
            });

            // Event relay: socket → Tauri frontend events.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match &event {
                        ServerEvent::Stop => {
                            app_handle.exit(0);
                        }
                        ServerEvent::SessionStart { tool, session } => {
                            let _ = app_handle.emit(
                                "bubble:session_start",
                                serde_json::json!({ "tool": tool, "session": session }),
                            );
                        }
                        ServerEvent::MessageDelta { delta } => {
                            let _ = app_handle.emit("bubble:delta", delta);
                        }
                        ServerEvent::SessionEnd => {
                            let _ = app_handle.emit("bubble:session_end", ());
                        }
                        ServerEvent::StateUpdate(s) => {
                            let _ = app_handle.emit("state:update", s);
                        }
                    }
                }
            });

            // Decay timer: fires every 30 minutes.
            let state_decay = Arc::clone(&state);
            let app_for_decay: AppHandle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = interval(Duration::from_secs(30 * 60));
                ticker.tick().await; // skip first immediate tick
                loop {
                    ticker.tick().await;
                    let s = state_decay.decay();
                    state_decay.save();
                    let _ = app_for_decay.emit("state:update", &s);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_status])
        .run(tauri::generate_context!())
        .expect("error running BitPet");
}

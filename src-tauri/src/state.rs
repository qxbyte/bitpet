use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetState {
    pub hunger: u8,
    pub mood: u8,
    pub energy: u8,
    pub pos_x: f64,
    pub pos_y: f64,
    pub last_active: i64,
}

impl Default for PetState {
    fn default() -> Self {
        // pos_x/y = sentinel (-140, -160) → lib.rs places at bottom-right on first run.
        Self {
            hunger: 20,
            mood: 80,
            energy: 90,
            pos_x: -140.0,
            pos_y: -160.0,
            last_active: now_ts(),
        }
    }
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn state_path() -> PathBuf {
    let home = dirs_next();
    home.join(".config").join("bitpet").join("state.json")
}

fn dirs_next() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
}

pub struct StateManager {
    state: Mutex<PetState>,
}

impl StateManager {
    pub fn new() -> Self {
        let state = Self::load_or_default();
        Self {
            state: Mutex::new(state),
        }
    }

    fn load_or_default() -> PetState {
        let path = state_path();
        if path.exists() {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            PetState::default()
        }
    }

    pub fn save(&self) {
        let state = self.state.lock().unwrap().clone();
        let path = state_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&state) {
            let _ = fs::write(path, json);
        }
    }

    pub fn get(&self) -> PetState {
        self.state.lock().unwrap().clone()
    }

    pub fn feed(&self) -> PetState {
        let mut s = self.state.lock().unwrap();
        s.hunger = s.hunger.saturating_sub(30);
        s.mood = s.mood.saturating_add(20).min(100);
        s.energy = s.energy.saturating_add(30).min(100);
        s.last_active = now_ts();
        s.clone()
    }

    pub fn touch(&self) {
        let mut s = self.state.lock().unwrap();
        s.last_active = now_ts();
    }

    pub fn update_position(&self, x: f64, y: f64) {
        let mut s = self.state.lock().unwrap();
        s.pos_x = x;
        s.pos_y = y;
    }

    pub fn play(&self) -> PetState {
        let mut s = self.state.lock().unwrap();
        s.mood = s.mood.saturating_add(15).min(100);
        s.energy = s.energy.saturating_sub(10);
        s.last_active = now_ts();
        s.clone()
    }

    pub fn sleep(&self) -> PetState {
        let mut s = self.state.lock().unwrap();
        s.hunger = 100;
        s.energy = s.energy.max(30);
        s.last_active = now_ts();
        s.clone()
    }

    /// Called every 6 minutes. Hunger +10/tick → 100% in 1 hour; energy -1/tick → same hourly rate as before.
    pub fn decay(&self) -> PetState {
        let mut s = self.state.lock().unwrap();
        s.hunger = s.hunger.saturating_add(10).min(100);
        s.energy = s.energy.saturating_sub(1);
        s.clone()
    }
}

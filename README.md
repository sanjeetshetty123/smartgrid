# GridMind: AI-Driven Residential Energy Management & Fault Protection System

GridMind is an intelligent residential microgrid and home energy management system (HEMS) combining Internet of Things (IoT) telemetry, real-time protection logic, machine learning (NILM and anomaly detection), and LLM-powered autonomous reasoning.

---

## 🏛 System Architecture & Data Flow

```text
       [ ESP32 Hardware / virtual_house.py ]
                     │  (Telemetry: V, I, P, PF, kWh)
                     ▼
          [ Mosquitto MQTT Broker ]  ◄── (ws://:9001 / mqtt://:1883)
          ├── home1/summary
          ├── home1/alerts
          ├── home1/virtual/{load}/telemetry
          ├── home1/virtual/{load}/cmd/manual
          ├── home1/ml/analysis
          ├── home1/ml/nilm_event
          ├── home1/ai/explanation
          └── home1/ai/forecast
                     │
     ┌───────────────┼───────────────┬─────────────────┐
     ▼               ▼               ▼                 ▼
[ backend.py ] [ ml_backend.py ] [ ai_brain.py ] [ ai_agent.py ]
 (Protection)   (NILM + Anomaly)   (LLM Chat)       (Auto-Shedding)
     │                                                 │
     ▼                                                 ▼
[ ai_forecast.py ] ─────────────────────────► [ React Dashboard ]
(Load Predictor)                             (smart-grid-dashboard)
                                             http://localhost:3000
```

---

## 📦 Directory & File Structure

### 1. Core Services & Backends (Python)
- **`virtual_house.py`**:
  Hardware-In-The-Loop (HIL) simulator. Simulates appliances (Ceiling Fan, Air Conditioner, Washing Machine cycle, Solar PV generation). Publishes real-time telemetry every 2 seconds to MQTT mimicking physical sensor nodes.
- **`backend.py`**:
  Core protection layer and coordinator.
  - Monitors voltage and load limits (Overcurrent / Overvoltage detection).
  - Implements priority-based load shedding (Tier 3 Deferrable -> Tier 2 Comfort -> Tier 1 Essential).
  - Triggers automated emergency voice call alerts to your phone via Twilio.
  - Continuously logs structured data to `telemetry_log.csv`.
- **`ml_backend.py`**:
  Non-Intrusive Load Monitoring (NILM) and real-time anomaly detection.
  - NILM: Classifies appliance state changes from the aggregate mains feed using a K-Nearest Neighbors (KNN) model trained on power step, power factor, and inrush current characteristics.
  - Anomaly Detection: Uses scikit-learn `IsolationForest` to spot abnormal electrical behavior.
- **`ai_brain.py` (Tier 1 AI)**:
  LLM-powered conversational interface (Groq / Llama 3) running on port `5005`.
  - Ingests live MQTT telemetry into a rolling memory buffer.
  - Answers user/judge queries ("Why did power spike?", "How can I reduce my bill?").
  - Anomaly Explainer: Translates raw machine-learning anomaly flags into human-friendly explanations.
- **`ai_agent.py` (Tier 2 AI)**:
  Autonomous energy dispatch agent running on port `5006`.
  - Evaluates grid safety limits (2000 W) against total power demand.
  - Reasons about load priorities and available solar generation to make shedding and restoration decisions.
  - Supports `advisory` (recommendation only) and `active` (automated MQTT command execution) modes.
- **`ai_forecast.py` (Tier 3 AI)**:
  Predictive load forecasting service running on port `5007`.
  - Real-time trend fitting to predict load ~20 seconds ahead.
  - Calculates Mean Absolute Error (MAE) against actual measurements.
  - Emits early warnings on `home1/ai/forecast` before overloads occur.
- **`dashboard.py` & `dashboard_v2.py`**:
  Streamlit-based live monitoring dashboards with interactive gauges, telemetry logs, and manual control overrides.
- **`test_call.py`**:
  Diagnostic script to test Twilio automated emergency voice call alerts.
- **`test_ws.html`**:
  Lightweight WebSocket test harness for MQTT broker diagnostics.

### 2. Frontend Application (`smart-grid-dashboard/`)
- Modern React application bootstrapped with Tailwind CSS.
- Connects directly to the Mosquitto MQTT broker via WebSocket (`ws://localhost:9001/mqtt`).
- **Key Components (`src/components/`)**:
  - `Dashboard.js`: Main telemetry console, real-time energy flow diagram, live gauges, relay controls.
  - `AgentForecastPanels.js`: Autonomous agent decision feed, reasoning logs, and predictive load curve.
  - `AiEnginePanel.js`: LLM chat assistant and anomaly explanation cards.
  - `RupeeInsights.js`: Real-time electricity cost estimation (₹/kWh) and tariff savings.
  - `HeroPage.js`, `AboutPage.js`, `LoginPage.js`: User portal, landing page, and project documentation.
  - `SideCircuits.js`, `BootSequence.js`, `IntroSequence.js`: Cyberpunk/industrial aesthetic UI animations.

### 3. Broker & Environment Configuration
- **`mosquitto.conf`**: Base Mosquitto broker configuration (TCP port 1883).
- **`mosquitto-ws-bridge.conf`**: Mosquitto configuration enabling the WebSocket listener on port 9001 for React frontend consumption.
- **`.env.example`**: Environment variable template (`GROQ_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_TO_PHONE_NUMBER`).
- **`smart-grid-dashboard/.env`**: React environment settings (`REACT_APP_MQTT_URL`, `REACT_APP_HISTORY_MAX`).

### 4. Technical Documentation
- **`extracted_old_report.txt`**:
  Complete academic project report containing mathematical models, electrical specs, problem formulation, literature review, and algorithm pseudocode.

---

## 🚀 Quick Start / Execution Sequence

1. **Start MQTT Broker**:
   ```bash
   mosquitto -c mosquitto-ws-bridge.conf
   ```
2. **Start Virtual House Simulator**:
   ```bash
   python virtual_house.py
   ```
3. **Start Core Backend**:
   ```bash
   python backend.py
   ```
4. **Start ML & AI Services**:
   ```bash
   python ml_backend.py
   python ai_brain.py
   python ai_agent.py
   python ai_forecast.py
   ```
5. **Start Frontend Dashboard**:
   ```bash
   cd smart-grid-dashboard
   npm install
   npm start
   ```


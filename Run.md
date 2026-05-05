# Trade Alchemist – Paper Trading Simulator

## Requirements
- Python 3.10+
- VS Code
- MongoDB Atlas

---

## Setup

1. Open the project folder in VS Code.

2. Create `.env` file in: `backend_api/.env`

Add in `backend_api/.env`:

MONGODB_URI=your_mongodb_atlas_url_here
FIREBASE_SERVICE_ACCOUNT_PATH=

Optional (if you want the backend to auto-run the simulator ticker):
ENABLE_PRICE_TICKER=true
PRICE_TICK_INTERVAL_SECONDS=30

Note: `simulator_engine/.env` is only needed if you run the legacy standalone simulator scripts. The app runtime price simulation is driven by FastAPI (`/simulation/*`) using `backend_api/simulator_tick.py`.

3. Install dependencies: In backend_api
bash

pip install pymongo fastapi uvicorn python-dotenv firebase-admin

**Run**
Start Backend API

In terminal : cd backend_api -> uvicorn main:app --reload
// python -m uvicorn main:app --reload

Simulation controls (runtime):
- Manual single tick: `POST http://127.0.0.1:8000/simulation/tick`
- Start auto ticker: `POST http://127.0.0.1:8000/simulation/start`
- Stop auto ticker: `POST http://127.0.0.1:8000/simulation/stop`

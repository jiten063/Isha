import os
import json
import base64
from flask import Flask, request, jsonify
from datetime import datetime
import random

# --- Firebase Admin SDK Setup ---
# This is the standard, secure way for a backend server to access Firebase.
# It requires the service account key to be set as an environment variable in Vercel.
import firebase_admin
from firebase_admin import credentials, firestore

db = None
try:
    encoded_creds = os.environ.get('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64')
    if not encoded_creds:
        raise ValueError("FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 environment variable not set.")
    
    decoded_creds_json = base64.b64decode(encoded_creds).decode('utf-8')
    creds_dict = json.loads(decoded_creds_json)
    cred = credentials.Certificate(creds_dict)
    
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    
    db = firestore.client()
    print("Firebase Admin SDK initialized successfully.")
except Exception as e:
    print(f"FATAL: Could not initialize Firebase Admin SDK: {e}")
# --- End Firebase Setup ---


app = Flask(__name__)

# --- Helper Functions for Scoring ---
def get_age(dob_str):
    if not dob_str: return 30
    try:
        today = datetime.now()
        birth_date = datetime.strptime(dob_str, '%Y-%m-%d')
        age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
        return age
    except:
        return 30 # Return default if date format is wrong

def get_age_group(age):
    if age <= 5: return "0-5"
    if age <= 15: return "6-15"
    if age <= 40: return "16-40"
    if age <= 60: return "41-60"
    return ">60"

# --- Dynamic Data Simulation ---
def get_dynamic_environmental_data(district):
    now = datetime(2025, 9, 13, 17, 18)
    data = {
        "timestamp": now.isoformat(), "season": "Post-Monsoon",
        "weeks_since_monsoon_peak": 4, "days_since_last_rain": 4,
        "hour_of_day": now.hour, "aqi": 110, "temperature_c": 29,
        "local_vector_index": 28, "local_outbreak_alert": "Dengue",
    }
    if district in ["Ghaziabad", "Noida", "Kanpur Nagar"]: data["aqi"] = 150
    if district == "Gorakhpur": data["local_outbreak_alert"] = "AES"
    return data

# --- Disease-Specific Risk Calculators ---
def calculate_dengue_risk(profile, env_data):
    core = profile.get('core', {})
    lifestyle = profile.get('lifestyle', {})
    age = get_age(core.get('dob'))
    age_group = get_age_group(age)
    total_score = 0
    
    weights = {"6-15": 3, "16-40": 2, ">60": 4}
    scores = {"6-15": 7, "16-40": 5, ">60": 6}
    total_score += (weights.get(age_group, 1)) * (scores.get(age_group, 3))
    
    urban_districts = ["Lucknow", "Kanpur Nagar", "Ghaziabad", "Gautam Buddh Nagar", "Varanasi", "Prayagraj", "Meerut", "Agra"]
    total_score += 5 * (8 if core.get('district') in urban_districts else 4)
    total_score += 5 * min(10, env_data["weeks_since_monsoon_peak"] * 2)
    total_score += 5 * min(10, env_data["days_since_last_rain"] * 2)
    hour = env_data["hour_of_day"]
    total_score += 3 * (8 if (5 <= hour <= 9) or (16 <= hour <= 19) else 3)
    total_score += 5 * (env_data["local_vector_index"] / 4)
    if "Diabetes" in lifestyle.get('conditions', []): total_score += 40

    level = "LOW"
    if total_score > 200: level = "High"
    elif total_score > 100: level = "Moderate"
    
    return {"threat": "Dengue Fever Spike", "level": level, "action": "Apply mosquito repellent (DEET 20%) morning + evening."}

def calculate_respiratory_risk(profile, env_data):
    lifestyle = profile.get('lifestyle', {})
    age = get_age(profile.get('core', {}).get('dob'))
    age_group = get_age_group(age)
    total_score = 0
    aqi = env_data["aqi"]
    if aqi > 300: aqi_score = 10
    elif aqi > 200: aqi_score = 8
    elif aqi > 100: aqi_score = 6
    else: aqi_score = 3
    total_score += 5 * aqi_score
    weights = {">60": 5, "0-5": 4}; scores = {">60": 9, "0-5": 8}
    total_score += (weights.get(age_group, 2)) * (scores.get(age_group, 4))
    if "Asthma/COPD" in lifestyle.get('conditions', []): total_score += 80
    high_risk_jobs = ["Construction Worker", "Factory Worker", "Miner"]
    if lifestyle.get('occupation') in high_risk_jobs: total_score += 30
    level = "LOW"
    if total_score > 150: level = "High"
    elif total_score > 75: level = "Moderate"
    return {"threat": "Seasonal Influenza Surge", "level": level, "action": "Wear mask in crowded indoor areas."}

def generate_disease_trends(district):
    def create_trend(): return [random.randint(20, 100) for _ in range(15)]
    return [
        {"disease": "Dengue", "cases": create_trend()}, {"disease": "Malaria", "cases": create_trend()},
        {"disease": "Typhoid", "cases": create_trend()}, {"disease": "Viral Fever", "cases": create_trend()}
    ]

# --- Main API Endpoint ---
@app.route('/api/predict', methods=['POST'])
def get_prediction():
    if not db:
        return jsonify({"message": "Error: The backend database connection is not configured."}), 500

    try:
        data = request.json
        user_id = data.get('userId')
        if not user_id:
            return jsonify({"message": "User ID was not provided in the request."}), 400

        # Fetch the user's profile from Firestore using the provided userId
        doc_ref = db.collection('userProfiles').doc(user_id)
        profile_doc = doc_ref.get()
        if not profile_doc.exists:
            return jsonify({"message": f"No profile found for user ID: {user_id}"}), 404
        
        profile_data = profile_doc.to_dict()
        district = profile_data.get('core', {}).get('district')
        env_data = get_dynamic_environmental_data(district)
        
        dengue = calculate_dengue_risk(profile_data, env_data)
        respiratory = calculate_respiratory_risk(profile_data, env_data)
        gastro = {"threat": "Acute Gastroenteritis", "level": "Moderate", "action": "Drink only boiled/RO water."}
        
        risk_assessments = sorted(
            [r for r in [dengue, respiratory, gastro] if r['level'] != 'LOW'],
            key=lambda x: ({"High": 1, "Moderate": 2}.get(x['level'], 3))
        )
        
        response = {
            "risk_assessments": risk_assessments,
            "disease_trends": generate_disease_trends(district)
        }
        
        return jsonify(response), 200

    except Exception as e:
        print(f"ERROR in /api/predict: {e}")
        return jsonify({"message": f"An internal server error occurred: {e}"}), 500


import os
import json
import base64
from flask import Flask, request, jsonify
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore

# --- App Initialization ---
app = Flask(__name__)

# --- Securely Connect to Firestore Database ---
# This connection logic remains the same.
try:
    encoded_creds = os.environ.get('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64')
    if not encoded_creds:
        raise ValueError("FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 env var not set.")
    decoded_creds_json = base64.b64decode(encoded_creds).decode('utf-8')
    creds_dict = json.loads(decoded_creds_json)
    cred = credentials.Certificate(creds_dict)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    print("Firebase initialized successfully.")
except Exception as e:
    print(f"Error initializing Firebase: {e}")

# --- Pillar 2 & 3: Dynamic Environment & Temporal Data Simulation ---
def get_dynamic_environmental_data(district):
    """
    Simulates real-time environmental and temporal data.
    In a real system, this would fetch data from live APIs (weather, AQI, etc.).
    """
    # Using the specified time: Saturday, Sep 13, 2025, ~5:18 PM
    now = datetime(2025, 9, 13, 17, 18)
    
    # Base data for Lucknow in mid-September
    data = {
        "timestamp": now.isoformat(),
        "season": "Post-Monsoon",
        "weeks_since_monsoon_peak": 4,
        "days_since_last_rain": 4, # Simulating light rain on Tuesday
        "hour_of_day": now.hour,
        "aqi": 110, # Moderate AQI for Lucknow in Sep
        "temperature_c": 29,
        "local_vector_index": 28, # High Container Index
        "local_outbreak_alert": "Dengue", # Active alert
    }

    # District-specific overrides
    if district in ["Ghaziabad", "Noida", "Kanpur Nagar"]:
        data["aqi"] = 150 # Higher baseline pollution
    if district == "Gorakhpur":
        data["local_outbreak_alert"] = "AES"

    return data

# --- Helper Functions for Scoring ---
def get_age(dob_str):
    if not dob_str: return 30 # Default age
    return (datetime.now().year - datetime.strptime(dob_str, '%Y-%m-%d').year)

def get_age_group(age):
    if age <= 5: return "0-5"
    if age <= 15: return "6-15"
    if age <= 40: return "16-40"
    if age <= 60: return "41-60"
    return ">60"

# --- Disease-Specific Risk Calculators ---

def calculate_dengue_risk(profile, env_data):
    """Calculates the UPSDRI score for Dengue Fever."""
    score_card = []
    total_score = 0
    
    core = profile.get('core', {})
    lifestyle = profile.get('lifestyle', {})
    age = get_age(core.get('dob'))
    age_group = get_age_group(age)

    # Parameter: Age Group
    weights = {"6-15": 3, "16-40": 2, ">60": 4} # Children and elderly are more vulnerable
    scores = {"6-15": 7, "16-40": 5, ">60": 6}
    weight = weights.get(age_group, 1)
    score = scores.get(age_group, 3)
    score_card.append({"param": "Age Group", "value": age_group, "score": weight * score})

    # Parameter: Location (Urban vs Rural - simple proxy)
    urban_districts = ["Lucknow", "Kanpur Nagar", "Ghaziabad", "Gautam Buddh Nagar", "Varanasi", "Prayagraj", "Meerut", "Agra"]
    is_urban = core.get('district') in urban_districts
    weight = 5
    score = 8 if is_urban else 4
    score_card.append({"param": "Location", "value": "Urban" if is_urban else "Rural", "score": weight * score})

    # Parameter: Weeks Since Monsoon Peak
    weight = 5
    score = min(10, env_data["weeks_since_monsoon_peak"] * 2) # Score peaks 3-5 weeks post-monsoon
    score_card.append({"param": "Weeks Since Monsoon Peak", "value": env_data["weeks_since_monsoon_peak"], "score": weight * score})

    # Parameter: Water Stagnation Index
    weight = 5
    score = min(10, env_data["days_since_last_rain"] * 2)
    score_card.append({"param": "Days Since Rain", "value": env_data["days_since_last_rain"], "score": weight * score})

    # Parameter: Hour of Day (Aedes mosquito is a day biter, peaks at dawn/dusk)
    weight = 3
    hour = env_data["hour_of_day"]
    score = 8 if (5 <= hour <= 9) or (16 <= hour <= 19) else 3
    score_card.append({"param": "Time of Day", "value": f"{hour}:00", "score": weight * score})

    # Parameter: Local Vector Index
    weight = 5
    score = env_data["local_vector_index"] / 4 # Scale 0-100 index to 0-10 score
    score_card.append({"param": "Vector Index", "value": f"{env_data['local_vector_index']}%", "score": weight * score})
    
    # Parameter: Co-morbidities
    if "Diabetes" in lifestyle.get('conditions', []):
        score_card.append({"param": "Co-morbidity", "value": "Diabetes", "score": 40}) # High penalty

    # Calculate final score and level
    total_score = sum(item['score'] for item in score_card)
    if total_score > 300: level = "VERY HIGH"
    elif total_score > 200: level = "HIGH"
    elif total_score > 100: level = "MODERATE"
    else: level = "LOW"

    return {
        "disease": "Dengue Fever",
        "score": total_score,
        "level": level,
        "details": score_card
    }

def calculate_respiratory_risk(profile, env_data):
    """Calculates the UPSDRI score for Respiratory Illness."""
    score_card = []
    
    core = profile.get('core', {})
    lifestyle = profile.get('lifestyle', {})
    age = get_age(core.get('dob'))
    age_group = get_age_group(age)

    # Parameter: Air Quality Index (AQI)
    weight = 5
    aqi = env_data["aqi"]
    if aqi > 300: score = 10
    elif aqi > 200: score = 8
    elif aqi > 100: score = 6
    else: score = 3
    score_card.append({"param": "AQI", "value": aqi, "score": weight * score})
    
    # Parameter: Age Group
    weights = {">60": 5, "0-5": 4}
    scores = {">60": 9, "0-5": 8}
    weight = weights.get(age_group, 2)
    score = scores.get(age_group, 4)
    score_card.append({"param": "Age Group", "value": age_group, "score": weight * score})

    # Parameter: Co-morbidities (Asthma/COPD is a huge multiplier)
    if "Asthma/COPD" in lifestyle.get('conditions', []):
        score_card.append({"param": "Co-morbidity", "value": "Asthma/COPD", "score": 80})

    # Parameter: Occupation
    high_risk_jobs = ["Construction Worker", "Factory Worker", "Miner"]
    if lifestyle.get('occupation') in high_risk_jobs:
         score_card.append({"param": "Occupation", "value": lifestyle.get('occupation'), "score": 30})
    
    # Calculate final score and level
    total_score = sum(item['score'] for item in score_card)
    if total_score > 250: level = "VERY HIGH"
    elif total_score > 150: level = "HIGH"
    elif total_score > 75: level = "MODERATE"
    else: level = "LOW"

    return {
        "disease": "Respiratory Illness",
        "score": total_score,
        "level": level,
        "details": score_card
    }

# --- The Core Logic: The "Brain" ---
def analyze_risk(profile):
    """
    Main analysis engine. Runs profile data through all relevant disease models.
    """
    district = profile.get('core', {}).get('district', 'Lucknow')
    # 1. Get real-time environmental data
    env_data = get_dynamic_environmental_data(district)
    
    # 2. Run all disease risk calculators
    dengue_analysis = calculate_dengue_risk(profile, env_data)
    respiratory_analysis = calculate_respiratory_risk(profile, env_data)
    
    # 3. Compile and return results
    return {
        "environmental_conditions": env_data,
        "risk_assessments": [dengue_analysis, respiratory_analysis]
    }


# --- API Endpoints ---
@app.route('/api/profile', methods=['POST'])
def save_profile():
    # This function remains unchanged
    try:
        profile_data = request.json
        db = firestore.client()
        user_name = profile_data.get('core', {}).get('name', 'unknown_user')
        doc_ref = db.collection('userProfiles').document(user_name.replace(" ", "_").lower())
        doc_ref.set(profile_data)
        return jsonify({"status": "success", "message": "Profile saved successfully!"}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/predict', methods=['POST'])
def get_prediction():
    # This function now calls the new, powerful 'analyze_risk' engine
    try:
        user_name = request.json.get('name')
        if not user_name: return jsonify({"status": "error", "message": "User name is required."}), 400
        
        db = firestore.client()
        doc_ref = db.collection('userProfiles').document(user_name.replace(" ", "_").lower())
        profile = doc_ref.get()

        if not profile.exists: return jsonify({"status": "error", "message": "Profile not found."}), 404
        
        profile_data = profile.to_dict()
        
        # Run the new analysis engine
        predictions = analyze_risk(profile_data)
        
        return jsonify(predictions), 200

    except Exception as e:
        print(f"Error during prediction: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


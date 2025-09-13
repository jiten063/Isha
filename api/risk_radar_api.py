from flask import Flask, request, jsonify

app = Flask(__name__)

# This API's only job is to provide the simple, compact risk list.
def get_compact_risk_list(profile):
    """
    Generates a simple list of risks based on the user's district.
    """
    district = profile.get("currentDistrict", "Default")

    # In a real system, this data would be calculated. Here, it's pre-written.
    risk_data = {
      "Default": [
        {"level": "Immediate", "title": "Dengue Fever Spike", "action": "🦟 Apply mosquito repellent (DEET 20%) morning + evening."},
        {"level": "High", "title": "Seasonal Influenza Surge", "action": "😷 Wear mask in crowded indoor areas."},
        {"level": "Moderate", "title": "Acute Gastroenteritis", "action": "💧 Drink only boiled/RO water."}
      ],
      "Kanpur Nagar": [
        {"level": "Immediate", "title": "Dengue Fever Spike", "action": "🦟 Apply mosquito repellent (DEET 20%) morning + evening."},
        {"level": "High", "title": "Seasonal Influenza Surge", "action": "😷 Wear mask in crowded indoor areas."},
        {"level": "Moderate", "title": "Acute Gastroenteritis", "action": "💧 Drink only boiled/RO water."}
      ],
      # Add other specific districts here if you want
    }
    
    return risk_data.get(district, risk_data["Default"])

@app.route('/api/risk_radar_api', methods=['POST'])
def risk_radar_api():
    user_profile = request.json.get('profileData', {})
    risks = get_compact_risk_list(user_profile)
    return jsonify(risks)

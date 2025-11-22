from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
from werkzeug.utils import secure_filename
import os
import io
import json
import sqlite3
import hashlib
import time
import base64
import requests
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from PIL import Image, ImageOps
import tensorflow as tf
from tensorflow.keras.models import load_model
import matplotlib.pyplot as plt
from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas
from io import BytesIO

# Weather API key
WEATHER_API_KEY = '9034df5a114ddf881c88cc0663f597d2'

# Check if PyTorch model file exists but don't import PyTorch yet
PYTORCH_MODEL_EXISTS = os.path.exists("mobileNet_crop_disease_model_v1 (1).h5")
PYTORCH_AVAILABLE = False  # Default to False, will check on demand

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # Change this to a secure secret key

# Disable static file caching during development
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Weather API key
WEATHER_API_KEY = '9034df5a114ddf881c88cc0663f597d2'

# Custom Jinja2 filter for datetime formatting
@app.template_filter('datetime')
def format_datetime(value):
    try:
        dt = datetime.fromisoformat(value)
        return dt.strftime('%Y-%m-%d %H:%M')
    except:
        return value

# Constants
TF_MODEL_PATH = "mobileNet_crop_disease_model_v1 (1).h5"
PYTORCH_MODEL_PATH = "mobileNet_crop_disease_model_v1 (1).h5"
IMG_SIZE = (256,256)
CHANNELS = 3

# Always use TensorFlow for now until PyTorch issues are resolved
USE_PYTORCH = False
print(f"Using TensorFlow model: {TF_MODEL_PATH}")

# Note about PyTorch model
if PYTORCH_MODEL_EXISTS:
    print(f"PyTorch model found at {PYTORCH_MODEL_PATH}, but using TensorFlow model for now.")
    print("To use PyTorch model, install PyTorch and modify the USE_PYTORCH flag.")

# Class names: fixed to match the trained TensorFlow model
# Using the original 8 disease-category labels to align with model output
CLASS_NAMES = [
    "Corn Crop Diseases",
    "Cotton Crop Diseases",
    "Fruit Crop Diseases",
    "Pulse Crop Diseases",
    "Rice plant Diseases",
    "Tobacco Crop Diseases",
    "Vegetable Crop Diseases",
    "Wheat Crop Diseases",
]

# Helper functions (copied from app.py)
def ensure_rgb(img):
    if img.mode != "RGB":
        return img.convert("RGB")
    return img

def preprocess_image(pil_img, target_size=IMG_SIZE):
    """Preprocess image: EXIF-fix, RGB, direct resize to target size."""
    img = ImageOps.exif_transpose(pil_img)
    img = ensure_rgb(img)

    # Direct resize (matches many TF models incl. MobileNet)
    resized = img.resize(target_size, Image.LANCZOS)
    arr = np.asarray(resized).astype("float32") / 255.0
    arr = np.expand_dims(arr, axis=0)  # (1, H, W, 3)
    return arr, resized

def softmax(x):
    """Apply softmax function for probability distribution"""
    e = np.exp(x - np.max(x))
    return e / np.clip(e.sum(axis=-1, keepdims=True), 1e-9, None)

def is_diseased(class_name):
    """Determine if a class indicates disease"""
    tokens = class_name.lower()
    unhealthy_keywords = ["disease", "diseases", "blight", "rust", "mildew", 
                          "leaf spot", "bacterial", "viral", "wilt", "infect"]
    return any(k in tokens for k in unhealthy_keywords)

def crop_type_from_class(class_name):
    """Extract crop type from class name"""
    if "___" in class_name:
        crop = class_name.split("___")[0].strip()
        return crop
    # lightweight heuristics
    words = class_name.replace("plant", "").replace("Crop", "").replace("Diseases", "").replace("Disease", "")
    words = words.replace("_", " ").strip()
    # take first word as crop (works for 'Rice', 'Wheat', 'Corn', etc.)
    return words.split()[0] if words else class_name

# Model loading - cached to avoid reloading
_model_cache = None
def get_model():
    global _model_cache
    if _model_cache is None:
        _model_cache = TFModel(TF_MODEL_PATH)
    return _model_cache

# TensorFlow model wrapper class
class TFModel:
    def __init__(self, model_path):
        self.model = load_model(model_path)
        # Infer target input size from the model if available
        try:
            shape = getattr(self.model, 'input_shape', None)
            if shape and len(shape) >= 4:
                h, w = int(shape[1]), int(shape[2])
                self.target_size = (h, w)
                # Also store number of classes
                out = getattr(self.model, 'output_shape', None)
                if out and len(out) >= 2:
                    self.num_classes = int(out[-1])
                else:
                    self.num_classes = None
            else:
                self.target_size = IMG_SIZE
                self.num_classes = None
        except Exception:
            self.target_size = IMG_SIZE
            self.num_classes = None
    
    def predict(self, image_array, **kwargs):
        return self.model.predict(image_array, **kwargs)

# Database functions
def init_db():
    """Initialize the SQLite database"""
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (username TEXT PRIMARY KEY, password TEXT, created_date TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS user_predictions
                 (username TEXT, image_name TEXT, prediction TEXT, confidence REAL, 
                  is_healthy BOOLEAN, crop_type TEXT, prediction_date TEXT)''')
    conn.commit()
    conn.close()

def hash_password(password):
    """Create a secure hash of the password"""
    return hashlib.sha256(str.encode(password)).hexdigest()

def auth_user(username, password):
    """Authenticate a user with username and password"""
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    c.execute('SELECT password FROM users WHERE username=?', (username,))
    stored_password = c.fetchone()
    conn.close()
    return stored_password and stored_password[0] == hash_password(password)

def register_user(username, password):
    """Register a new user"""
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    try:
        c.execute('INSERT INTO users VALUES (?, ?, ?)', 
                 (username, hash_password(password), datetime.now().isoformat()))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def save_prediction(username, image_name, prediction, confidence, is_healthy, crop_type):
    """Save prediction results to database"""
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    c.execute('INSERT INTO user_predictions VALUES (?, ?, ?, ?, ?, ?, ?)',
              (username, image_name, prediction, confidence, is_healthy, crop_type, 
               datetime.now().isoformat()))
    conn.commit()
    conn.close()

def get_user_predictions(username):
    """Get a user's prediction history"""
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    c.execute('''SELECT image_name, prediction, confidence, is_healthy, crop_type, prediction_date 
                 FROM user_predictions WHERE username=? ORDER BY prediction_date DESC''', (username,))
    predictions = c.fetchall()
    conn.close()
    return predictions

# Initialize database
init_db()

# Routes
@app.route('/')
def home():
    if 'username' in session:
        return redirect(url_for('dashboard'))
    # Show minimal landing page with only "Get Started" button
    return render_template('landing.html')

@app.route('/auth')
def auth():
    if 'username' in session:
        return redirect(url_for('dashboard'))
    return render_template('auth.html')

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    if auth_user(data['username'], data['password']):
        session['username'] = data['username']
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Invalid credentials'})

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    if register_user(data['username'], data['password']):
        # Automatically log in the newly registered user
        session['username'] = data['username']
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Username already exists'})

@app.route('/logout')
def logout():
    session.pop('username', None)
    return redirect(url_for('home'))

@app.route('/dashboard')
def dashboard():
    if 'username' not in session:
        return redirect(url_for('home'))

    # Get prediction statistics
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM user_predictions WHERE username=?', (session['username'],))
    total_fields = c.fetchone()[0]

    c.execute('SELECT COUNT(*) FROM user_predictions WHERE username=? AND is_healthy=1', (session['username'],))
    healthy_crops = c.fetchone()[0]

    c.execute('SELECT COUNT(*) FROM user_predictions WHERE username=? AND is_healthy=0', (session['username'],))
    diseased_crops = c.fetchone()[0]

    conn.close()

    # Provide basic weather summary (client JS will fetch detailed data)
    weather = {
        'temperature': 29,
        'description': 'Clear Skies',
        'humidity': 60,
        'wind_speed': 5,
        'visibility': 10
    }

    crop_health = {
        'status': 'Stable',
        'status_class': 'status-stable',
        'soil_moisture': 55,
        'nutrient_level': 68,
        'disease_risk': 12
    }

    # Create stats object for template
    stats = {
        'fields': total_fields,
        'healthy': healthy_crops,
        'diseased': diseased_crops
    }

    # Recent 3 predictions for the activity feed
    recent_predictions = []
    try:
        conn = sqlite3.connect('user_data.db')
        c = conn.cursor()
        c.execute('''SELECT image_name, prediction, confidence, is_healthy, crop_type, prediction_date
                     FROM user_predictions WHERE username=? ORDER BY prediction_date DESC LIMIT 3''', (session['username'],))
        for row in c.fetchall():
            recent_predictions.append({
                'image': (row[0] or '').replace('\\','/'),
                'prediction': row[1],
                'confidence': f"{float(row[2]):.0%}",
                'is_healthy': bool(row[3]),
                'crop_type': row[4],
                'date': row[5],
            })
        conn.close()
    except Exception as e:
        app.logger.error(f"Recent predictions fetch error: {e}")

    return render_template(
        'dashboard.html',
        username=session['username'],
        stats=stats,
        weather=weather,
        crop_health=crop_health,
        recent_predictions=recent_predictions
    )

@app.route('/weather')
def weather_api():
    """Return current weather and simple forecast. Accepts optional lat/lon query params."""
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)

    # Default to New York if no coordinates
    if lat is None or lon is None:
        lat, lon = 40.7128, -74.0060

    try:
        # Current weather
        current_url = (
            f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&units=metric&appid={WEATHER_API_KEY}"
        )
        current_resp = requests.get(current_url, timeout=8)
        current_json = current_resp.json()

        # Forecast (use 3-list items from 5-day/3-hour API)
        forecast_url = (
            f"https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&units=metric&appid={WEATHER_API_KEY}"
        )
        forecast_resp = requests.get(forecast_url, timeout=8)
        forecast_json = forecast_resp.json()

        current = {
            'location': current_json.get('name') or 'Unknown',
            'temp': float(current_json['main']['temp']) if 'main' in current_json else 0.0,
            'description': (current_json.get('weather') or [{}])[0].get('description', ''),
            'humidity': int(current_json['main']['humidity']) if 'main' in current_json else 0,
            'wind_speed': float(current_json['wind']['speed']) if 'wind' in current_json else 0.0,
            'visibility': int(current_json.get('visibility', 0)),
            'rainfall': float(((current_json.get('rain') or {}).get('1h')) or 0.0)
        }

        # Build a forecast for the next 3 distinct days
        forecast = []
        seen_dates = set()
        for item in (forecast_json.get('list') or []):
            dt_txt = item.get('dt_txt') or ''
            try:
                dt = datetime.strptime(dt_txt, '%Y-%m-%d %H:%M:%S')
            except Exception:
                dt = None
            if not dt:
                continue
            date_key = dt.date()
            # Skip current date, pick first occurrence per future day
            if date_key <= datetime.utcnow().date() or date_key in seen_dates:
                continue
            seen_dates.add(date_key)
            iso = dt.strftime('%Y-%m-%dT%H:%M:%SZ')
            forecast.append({
                'date': iso,
                'temp': float(item['main']['temp']) if 'main' in item else 0.0,
                'description': ((item.get('weather') or [{}])[0].get('description', ''))
            })
            if len(forecast) == 3:
                break

        return jsonify({'current': current, 'forecast': forecast})

    except Exception as e:
        app.logger.error(f"Weather API error: {e}")
        # Fallback static sample
        now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
        return jsonify({
            'error': str(e),
            'current': {
                'location': 'Sample City',
                'temp': 29,
                'description': 'clear sky',
                'humidity': 60,
                'wind_speed': 2.0,
                'visibility': 10000,
                'rainfall': 0
            },
            'forecast': [
                {'date': (now+timedelta(days=1, hours=9)).strftime('%Y-%m-%dT%H:%M:%SZ'), 'temp': 28, 'description': 'scattered clouds'},
                {'date': (now+timedelta(days=2, hours=9)).strftime('%Y-%m-%dT%H:%M:%SZ'), 'temp': 27, 'description': 'light rain'},
                {'date': (now+timedelta(days=3, hours=9)).strftime('%Y-%m-%dT%H:%M:%SZ'), 'temp': 30, 'description': 'clear sky'}
            ]
        })

@app.route('/crop_health')
def crop_health_api():
    if 'username' not in session:
        return jsonify({'error': 'unauthorized'}), 401

    try:
        conn = sqlite3.connect('user_data.db')
        c = conn.cursor()
        c.execute('''
            SELECT crop_type,
                   COUNT(*) as total,
                   SUM(CASE WHEN is_healthy = 1 THEN 1 ELSE 0 END) as healthy,
                   SUM(CASE WHEN is_healthy = 0 THEN 1 ELSE 0 END) as diseased
            FROM user_predictions
            WHERE username = ?
            GROUP BY crop_type
        ''', (session['username'],))
        rows = c.fetchall()
        conn.close()

        data = []
        for crop_type, total, healthy, diseased in rows:
            total = int(total or 0)
            healthy = int(healthy or 0)
            diseased = int(diseased or 0)
            health_pct = round((healthy / total) * 100, 2) if total > 0 else 0
            data.append({
                'crop_type': crop_type or 'Unknown',
                'total': total,
                'healthy': healthy,
                'diseased': diseased,
                'health_percentage': health_pct,
            })

        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Crop health API error: {e}")
        return jsonify({'error': 'internal_error'}), 500

@app.route('/history')
def history():
    if 'username' not in session:
        return redirect(url_for('home'))
    
    predictions = get_user_predictions(session['username'])
    
    # Format predictions for template
    history_data = []
    for p in predictions:
        history_data.append({
            # Normalize path separators to forward slashes for static URLs
            'img': (p[0] or '').replace('\\', '/'),
            'disease': p[1],
            'conf': f"{p[2]:.2%}",
            'status': 'Healthy' if p[3] else 'Diseased',
            'crop': p[4],
            'date': format_datetime(p[5])
        })
        
    return render_template('history.html', history=history_data, username=session['username'])

@app.route('/predict', methods=['GET', 'POST'])
def predict():
    if 'username' not in session:
        return redirect(url_for('home'))

    if request.method == 'POST':
        if 'image' not in request.files:
            return jsonify({'success': False, 'message': 'No image uploaded'})
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No image selected'})
        
        try:
            # Ensure uploads directory exists
            uploads_dir = os.path.join('static', 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)

            # Save original file to static/uploads with timestamp for uniqueness
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            safe_name = secure_filename(file.filename)
            stored_name = f"{timestamp}_{safe_name}"
            stored_path = os.path.join(uploads_dir, stored_name)
            file.save(stored_path)

            # Process image for prediction
            image = Image.open(stored_path)
            model = get_model()
            arr, _ = preprocess_image(image, target_size=model.target_size)
            
            # Make prediction
            prediction = model.predict(arr, verbose=0)
            class_idx = int(np.argmax(prediction))
            confidence = float(np.max(prediction))

            # Ensure class-name mapping matches model output dimension
            num_classes = getattr(model, 'num_classes', None)
            if num_classes is None:
                try:
                    num_classes = int(prediction.shape[-1])
                except Exception:
                    num_classes = None

            if num_classes is not None and len(CLASS_NAMES) == num_classes:
                predicted_class = CLASS_NAMES[class_idx]
            else:
                app.logger.warning(
                    f"Class names mismatch: len(CLASS_NAMES)={len(CLASS_NAMES)} vs model classes={num_classes}."
                )
                predicted_class = f"Class_{class_idx}"
            # Mark as diseased when predicted class indicates disease.
            # This aligns with classifier labels (all are disease categories).
            is_healthy_flag = not is_diseased(predicted_class)
            crop_type = crop_type_from_class(predicted_class)
            
            # Save prediction with stored image path relative to static/ (use forward slashes)
            relative_image_path = f"uploads/{stored_name}"
            save_prediction(
                session['username'],
                relative_image_path,
                predicted_class,
                confidence,
                is_healthy_flag,
                crop_type
            )
            
            # Frontend expects numeric percent (0-100) without symbol for bars
            confidence_pct = round(confidence * 100.0, 2)
            return jsonify({
                'success': True,
                'prediction': predicted_class,
                'confidence': confidence_pct,
                'crop_type': crop_type,
                'is_healthy': is_healthy_flag,
                'image_url': url_for('static', filename=relative_image_path)
            })
            
        except Exception as e:
            app.logger.error(f"Prediction error: {str(e)}")
            return jsonify({'success': False, 'message': f"Error during prediction: {str(e)}"})

    return render_template('predict.html', username=session['username'])

if __name__ == '__main__':
    # Create static and templates folders if they don't exist
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    
    print("Starting CropCare AI Flask App...")
    print("Visit http://127.0.0.1:5000 to access the application")
    app.run(debug=True)
